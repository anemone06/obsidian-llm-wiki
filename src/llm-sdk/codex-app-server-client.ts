/* eslint-disable import/no-nodejs-modules */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface, type Interface as ReadlineInterface } from 'readline';
import process from 'process';
import { Buffer } from 'buffer';
import { CodexSessionState, LLMClient } from '../types';

type CreateMessageParams = LLMClient['createMessage'] extends (p: infer P) => unknown ? P : never;
type CreateMessageStreamParams = NonNullable<LLMClient['createMessageStream']> extends (p: infer P) => unknown ? P : never;

export interface CodexAppServerClientOptions {
  cliPath?: string;
  cwd?: string;
  model?: string;
  sandbox?: 'read-only' | 'workspace-write';
  approvalPolicy?: 'never' | 'on-request';
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number | null;
}

interface ThreadStartResult {
  thread: {
    id: string;
    path?: string | null;
  };
}

type ThreadResumeResult = ThreadStartResult;

interface TurnStartResult {
  turn: {
    id: string;
  };
}

interface TurnCompletedNotification {
  threadId: string;
  turn: {
    id: string;
    status?: string;
    error?: { message?: string } | null;
    items?: Array<{ type?: string; text?: string }>;
  };
}

interface AgentMessageDeltaNotification {
  threadId: string;
  turnId: string;
  delta: string;
}

type NotificationHandler = (params: unknown) => void;
type ServerRequestHandler = (id: string | number, params: unknown) => Promise<unknown>;

class CodexRpcTransport {
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private notificationHandlers = new Map<string, NotificationHandler>();
  private serverRequestHandlers = new Map<string, ServerRequestHandler>();
  private disposed = false;

  constructor(private readonly proc: ChildProcessWithoutNullStreams) {}

  start(onExit: (error: Error) => void): ReadlineInterface {
    const rl = createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => this.handleLine(line));
    this.proc.on('exit', (code, signal) => {
      const suffix = signal ? `signal ${signal}` : `code ${code}`;
      const error = new Error(`Codex app-server exited (${suffix})`);
      this.rejectAllPending(error);
      onExit(error);
    });
    this.proc.on('error', (err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.rejectAllPending(error);
      onExit(error);
    });
    return rl;
  }

  request<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs > 0
        ? window.setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Codex request timeout: ${method} (${timeoutMs}ms)`));
        }, timeoutMs)
        : null;

      this.pending.set(id, { resolve, reject, timer });
      this.sendRaw(msg);
    });
  }

  notify(method: string, params?: unknown): void {
    this.sendRaw(params === undefined
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params });
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  onServerRequest(method: string, handler: ServerRequestHandler): void {
    this.serverRequestHandlers.set(method, handler);
  }

  clearNotifications(): void {
    this.notificationHandlers.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.rejectAllPending(new Error('Codex transport disposed'));
  }

  private sendRaw(msg: unknown): void {
    if (this.disposed) return;
    this.proc.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private handleLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    const id = msg.id as number | string | undefined;
    const method = msg.method as string | undefined;

    if (typeof id === 'number' && !method) {
      this.handleResponse(id, msg);
      return;
    }

    if (method && id === undefined) {
      this.notificationHandlers.get(method)?.(msg.params);
      return;
    }

    if (method && id !== undefined) {
      this.handleServerRequest(id, method, msg.params);
    }
  }

  private handleResponse(id: number, msg: Record<string, unknown>): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (pending.timer) window.clearTimeout(pending.timer);

    if (msg.error) {
      const err = msg.error as JsonRpcError;
      pending.reject(new Error(err.message || `Codex JSON-RPC error ${err.code}`));
      return;
    }
    pending.resolve(msg.result);
  }

  private handleServerRequest(id: string | number, method: string, params: unknown): void {
    const handler = this.serverRequestHandlers.get(method);
    if (!handler) {
      this.sendRaw({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unhandled Codex server request: ${method}` },
      });
      return;
    }

    handler(id, params).then(
      (result) => this.sendRaw({ jsonrpc: '2.0', id, result }),
      (err) => this.sendRaw({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
      }),
    );
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export class CodexAppServerClient implements LLMClient {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private transport: CodexRpcTransport | null = null;
  private rl: ReadlineInterface | null = null;
  private threadId: string | null = null;
  private threadPath: string | null = null;
  private loadedThreadId: string | null = null;
  private starting: Promise<void> | null = null;
  private disposed = false;

  private readonly cliPath: string;
  private readonly cwd: string;
  private readonly model: string | undefined;
  private readonly sandbox: 'read-only' | 'workspace-write';
  private readonly approvalPolicy: 'never' | 'on-request';
  private readonly timeoutMs: number;
  private readonly env: Record<string, string | undefined>;

  constructor(opts: CodexAppServerClientOptions = {}) {
    this.cliPath = opts.cliPath?.trim() || 'codex';
    this.cwd = opts.cwd || process.cwd();
    this.model = opts.model?.trim() || undefined;
    this.sandbox = opts.sandbox ?? 'read-only';
    this.approvalPolicy = opts.approvalPolicy ?? 'never';
    this.timeoutMs = opts.timeoutMs ?? 600000;
    this.env = opts.env ?? process.env;
  }

  async createMessage(params: CreateMessageParams): Promise<string> {
    return this.runTurn(params, undefined);
  }

  async createMessageStream(params: CreateMessageStreamParams): Promise<string> {
    return this.runTurn(params, params.onChunk);
  }

  async listModels(): Promise<string[]> {
    return [
      this.model,
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-5.3-codex-spark',
    ].filter((model): model is string => Boolean(model));
  }

  setSessionState(state?: CodexSessionState | null): void {
    if (state?.provider !== 'codex-cli') return;
    this.threadId = state.threadId ?? null;
    this.threadPath = state.sessionFilePath ?? null;
    this.loadedThreadId = null;
  }

  getSessionState(): CodexSessionState | null {
    if (!this.threadId) return null;
    return {
      provider: 'codex-cli',
      threadId: this.threadId,
      ...(this.threadPath ? { sessionFilePath: this.threadPath } : {}),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.transport?.dispose();
    this.rl?.close();
    this.proc?.kill('SIGTERM');
    this.transport = null;
    this.proc = null;
    this.rl = null;
    this.starting = null;
  }

  private async runTurn(params: CreateMessageParams | CreateMessageStreamParams, onChunk?: (chunk: string) => void): Promise<string> {
    await this.ensureReady();
    const transport = this.transport;
    if (!transport) throw new Error('Codex transport is not available');

    const threadId = await this.ensureThread(params.system);
    const prompt = buildCodexPrompt(params);
    let fullText = '';

    return new Promise<string>((resolve, reject) => {
      let turnId: string | null = null;
      let finished = false;

      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        transport.clearNotifications();
        this.installDefaultServerRequestHandlers(transport);
      };

      const finish = (fn: () => void) => {
        if (finished) return;
        finished = true;
        cleanup();
        fn();
      };

      const timer = this.timeoutMs > 0
        ? window.setTimeout(() => {
          finish(() => reject(new Error(`Codex turn timeout (${this.timeoutMs}ms)`)));
        }, this.timeoutMs)
        : null;

      transport.onNotification('item/agentMessage/delta', (raw) => {
        const event = raw as AgentMessageDeltaNotification;
        if (event.threadId !== threadId) return;
        if (turnId && event.turnId !== turnId) return;
        fullText += event.delta;
        onChunk?.(event.delta);
      });

      transport.onNotification('turn/completed', (raw) => {
        const event = raw as TurnCompletedNotification;
        if (event.threadId !== threadId) return;
        if (turnId && event.turn.id !== turnId) return;
        if (event.turn.status && event.turn.status !== 'completed') {
          const msg = event.turn.error?.message || `Codex turn ended with status ${event.turn.status}`;
          finish(() => reject(new Error(msg)));
          return;
        }

        if (!fullText) {
          fullText = extractAssistantText(event.turn.items);
        }
        finish(() => resolve(fullText));
      });

      transport.onNotification('error', (raw) => {
        const message = raw && typeof raw === 'object' && 'message' in raw
          ? String((raw as { message?: unknown }).message)
          : 'Codex app-server error';
        finish(() => reject(new Error(message)));
      });

      transport.request<TurnStartResult>('turn/start', {
        threadId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
        approvalPolicy: this.approvalPolicy,
        model: this.resolveModel(params.model),
        sandboxPolicy: this.buildSandboxPolicy(),
      }, this.timeoutMs).then(
        (result) => { turnId = result.turn.id; },
        (err) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))),
      );
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.disposed) throw new Error('Codex client disposed');
    if (this.transport && this.proc && !this.proc.killed) return;
    if (this.starting) {
      await this.starting;
      return;
    }

    this.starting = this.startAppServer();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async startAppServer(): Promise<void> {
    const args = [
      'app-server',
      '--listen',
      'stdio://',
      '-c',
      `sandbox="${this.sandbox}"`,
      '-c',
      `approval_policy="${this.approvalPolicy}"`,
    ];

    try {
      this.proc = spawn(this.cliPath, args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      throw mapCodexLaunchError(err, this.cliPath);
    }

    const transport = new CodexRpcTransport(this.proc);
    this.transport = transport;
    this.rl = transport.start((error) => {
      if (!this.disposed) {
        console.warn('[CodexAppServerClient] app-server exited:', error.message);
      }
      this.transport = null;
      this.proc = null;
      this.rl = null;
      this.loadedThreadId = null;
    });
    this.installDefaultServerRequestHandlers(transport);

    let stderr = '';
    this.proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    try {
      await transport.request('initialize', {
        clientInfo: { name: 'obsidian-llm-wiki', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      }, 30000);
      transport.notify('initialized');
    } catch (err) {
      this.dispose();
      const suffix = stderr.trim() ? `: ${stderr.trim()}` : '';
      throw new Error(`${err instanceof Error ? err.message : String(err)}${suffix}`);
    }
  }

  private installDefaultServerRequestHandlers(transport: CodexRpcTransport): void {
    const denyLegacy = async () => ({ decision: 'denied' });
    const decline = async () => ({ decision: 'decline' });
    transport.onServerRequest('applyPatchApproval', denyLegacy);
    transport.onServerRequest('execCommandApproval', denyLegacy);
    transport.onServerRequest('item/commandExecution/requestApproval', decline);
    transport.onServerRequest('item/fileChange/requestApproval', decline);
    transport.onServerRequest('item/permissions/requestApproval', decline);
  }

  private async ensureThread(system?: string): Promise<string> {
    const transport = this.transport;
    if (!transport) throw new Error('Codex transport is not available');
    const model = this.resolveModel();

    if (this.threadId && this.loadedThreadId === this.threadId) {
      return this.threadId;
    }

    if (this.threadId) {
      const resumed = await transport.request<ThreadResumeResult>('thread/resume', {
        threadId: this.threadId,
        model,
        approvalPolicy: this.approvalPolicy,
        sandbox: this.sandbox,
        baseInstructions: system,
        experimentalRawEvents: true,
        persistExtendedHistory: true,
      }, this.timeoutMs);
      this.threadId = resumed.thread.id;
      this.threadPath = resumed.thread.path ?? this.threadPath;
      this.loadedThreadId = resumed.thread.id;
      return this.threadId;
    }

    const started = await transport.request<ThreadStartResult>('thread/start', {
      model,
      cwd: this.cwd,
      approvalPolicy: this.approvalPolicy,
      sandbox: this.sandbox,
      baseInstructions: system,
      experimentalRawEvents: true,
      persistExtendedHistory: true,
      sandboxPolicy: this.buildSandboxPolicy(),
    }, this.timeoutMs);
    this.threadId = started.thread.id;
    this.threadPath = started.thread.path ?? null;
    this.loadedThreadId = started.thread.id;
    return this.threadId;
  }

  private resolveModel(requestModel?: string): string {
    return this.model || requestModel?.trim() || 'gpt-5.5';
  }

  private buildSandboxPolicy() {
    if (this.sandbox === 'workspace-write') {
      return {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      };
    }
    return {
      type: 'readOnly',
      networkAccess: false,
    };
  }
}

export function buildCodexPrompt(params: Pick<CreateMessageParams, 'system' | 'messages' | 'response_format'>): string {
  const parts: string[] = [];
  if (params.system) {
    parts.push(`<system>\n${params.system}\n</system>`);
  }
  for (const message of params.messages) {
    parts.push(`<${message.role}>\n${message.content}\n</${message.role}>`);
  }
  if (params.response_format?.type === 'json_object') {
    parts.push('Return only one valid JSON object. Do not wrap it in markdown.');
  }
  return parts.join('\n\n');
}

function extractAssistantText(items: TurnCompletedNotification['turn']['items']): string {
  if (!items) return '';
  return items
    .filter((item) => item.type === 'agentMessage' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}

function mapCodexLaunchError(err: unknown, cliPath: string): Error {
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'ENOENT') {
    return new Error(`Codex CLI not found: ${cliPath}. Install Codex CLI or set the Codex CLI path.`);
  }
  return err instanceof Error ? err : new Error(String(err));
}
