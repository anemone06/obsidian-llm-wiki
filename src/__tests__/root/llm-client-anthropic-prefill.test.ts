import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';
import { AnthropicClient, AnthropicCompatibleClient } from '../../llm-client';

// v1.20.1 hotfix: AnthropicClient prefill-not-supported fallback.
//
// Background: Claude Opus 4.8, 4.7, 4.6, Sonnet 4.6, Claude Fable 5,
// Claude Mythos 5, Claude Mythos Preview do not support assistant message
// prefilling (Anthropic API returns 400 "Prefilling assistant messages is
// not supported for this model.").
//
// See: https://platform.claude.com/docs/en/api/errors#common-validation-errors

const mockRequestUrl = vi.mocked(requestUrl);

function makePrefillErrorResponse(): Awaited<ReturnType<typeof requestUrl>> {
  // With throw:false, requestUrl returns a response object even on 400.
  // The Anthropic error body contains the specific "Prefilling" message.
  return {
    status: 400,
    text: JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Prefilling assistant messages is not supported for this model.',
      },
    }),
    json: {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Prefilling assistant messages is not supported for this model.',
      },
    },
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

function makeSuccessResponse(text: string): Awaited<ReturnType<typeof requestUrl>> {
  return {
    status: 200,
    text: JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }),
    json: { content: [{ type: 'text', text }], stop_reason: 'end_turn' },
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

function getBodyFromCall(callIndex: number): { messages: Array<{ role: string }> } {
  const callArgs = mockRequestUrl.mock.calls[callIndex][0] as unknown as { body: string };
  return JSON.parse(callArgs.body) as { messages: Array<{ role: string }> };
}

// Like getBodyFromCall but also exposes top-level `system` / `thinking` — needed
// to assert the Anthropic contract (system is a top-level param, never a role).
function getFullBody(callIndex: number): {
  messages: Array<{ role: string }>;
  system?: string;
  thinking?: unknown;
} {
  const callArgs = mockRequestUrl.mock.calls[callIndex][0] as unknown as { body: string };
  return JSON.parse(callArgs.body) as { messages: Array<{ role: string }>; system?: string; thinking?: unknown };
}

function makeErrorResponse(status: number, message: string): Awaited<ReturnType<typeof requestUrl>> {
  // throw:false → requestUrl resolves a response object even on 4xx.
  return {
    status,
    text: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }),
    json: { type: 'error', error: { type: 'invalid_request_error', message } },
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

describe('AnthropicClient prefill-not-supported fallback (#141, #147)', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('retries without prefill when 400 "Prefilling not supported" is returned', async () => {
    mockRequestUrl
      .mockResolvedValueOnce(makePrefillErrorResponse())
      .mockResolvedValueOnce(makeSuccessResponse('{"result": "ok"}'));

    const client = new AnthropicClient('test-key', 'https://api.anthropic.com');
    const result = await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Analyze this source' }],
      response_format: { type: 'json_object' },
    });

    expect(result).toContain('ok');

    const firstBody = getBodyFromCall(0);
    expect(firstBody.messages.some(m => m.role === 'assistant')).toBe(true);

    const secondBody = getBodyFromCall(1);
    expect(secondBody.messages.some(m => m.role === 'assistant')).toBe(false);
  });

  it('preserves response_format hint after prefill fallback', async () => {
    mockRequestUrl
      .mockResolvedValueOnce(makePrefillErrorResponse())
      .mockResolvedValueOnce(makeSuccessResponse('{"ok": true}'));

    const client = new AnthropicClient('test-key', 'https://api.anthropic.com');
    await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'test' }],
      response_format: { type: 'json_object' },
    });

    const secondBody = getBodyFromCall(1);
    expect(secondBody.messages).toHaveLength(1);
    expect(secondBody.messages[0].role).toBe('user');
  });

  it('caches prefill-not-supported to avoid future 400s', async () => {
    mockRequestUrl
      .mockResolvedValueOnce(makePrefillErrorResponse())
      .mockResolvedValueOnce(makeSuccessResponse('{"first": true}'));

    const client = new AnthropicClient('test-key', 'https://api.anthropic.com');
    await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'test' }],
      response_format: { type: 'json_object' },
    });

    mockRequestUrl.mockResolvedValueOnce(makeSuccessResponse('{"second": true}'));
    await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'test 2' }],
      response_format: { type: 'json_object' },
    });

    // 3 calls total (not 4): first 400 + fallback + second (no prefill)
    expect(mockRequestUrl).toHaveBeenCalledTimes(3);

    const thirdBody = getBodyFromCall(2);
    expect(thirdBody.messages.some(m => m.role === 'assistant')).toBe(false);
  });

  it('does not affect requests without response_format (no prefill)', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeSuccessResponse('plain text'));

    const client = new AnthropicClient('test-key', 'https://api.anthropic.com');
    const result = await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result).toBe('plain text');
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);

    const body = getBodyFromCall(0);
    expect(body.messages.every(m => m.role === 'user')).toBe(true);
  });
});

// Issue #141 regression: even though v1.20.2 detects the prefill rejection
// correctly (throw:false + "Prefilling..." match), the no-prefill RETRY body
// injected `{ role: 'system' }` into messages while ALSO setting top-level
// system. The Anthropic Messages API only accepts user/assistant roles in
// messages (system must be top-level), so the retry produced a SECOND 400 and
// ingestion failed. Production ingestion ALWAYS sends a system prompt — the
// tests above never did, so they missed this branch entirely.

// Simulates the real Anthropic Messages API under throw:false:
//   - assistant prefill (last message role 'assistant') → 400 "Prefilling..."
//   - any 'system' role inside messages[] → 400 (system must be top-level)
//   - otherwise → 200
function anthropicPrefillSim(text: string): typeof requestUrl {
  const impl = (opts: unknown): Promise<unknown> => {
    const body = JSON.parse((opts as { body: string }).body) as { messages: Array<{ role: string }> };
    const last = body.messages[body.messages.length - 1];
    if (last?.role === 'assistant') {
      return Promise.resolve(makeErrorResponse(400, 'Prefilling assistant messages is not supported for this model.'));
    }
    if (body.messages.some(m => m.role === 'system')) {
      return Promise.resolve(makeErrorResponse(400, "messages.0.role: Input should be 'user' or 'assistant'"));
    }
    return Promise.resolve(makeSuccessResponse(text));
  };
  return impl as unknown as typeof requestUrl;
}

// Simulates an endpoint that rejects thinking.type='disabled':
//   - any body carrying a `thinking` field → thinking-control 400
//   - any 'system' role inside messages[] → 400
function anthropicThinkingSim(text: string): typeof requestUrl {
  const impl = (opts: unknown): Promise<unknown> => {
    const body = JSON.parse((opts as { body: string }).body) as { messages: Array<{ role: string }>; thinking?: unknown };
    if (body.thinking !== undefined) {
      return Promise.resolve(makeErrorResponse(400, 'unknown field: thinking'));
    }
    if (body.messages.some(m => m.role === 'system')) {
      return Promise.resolve(makeErrorResponse(400, "messages.0.role: Input should be 'user' or 'assistant'"));
    }
    return Promise.resolve(makeSuccessResponse(text));
  };
  return impl as unknown as typeof requestUrl;
}

const SYSTEM_PROMPT = 'You are a wiki extraction engine.';

describe('Anthropic prefill fallback with a system prompt (#141 regression)', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('AnthropicClient: ingestion (system + json_object) succeeds after prefill fallback', async () => {
    mockRequestUrl.mockImplementation(anthropicPrefillSim('{"result":"ok"}'));

    const client = new AnthropicClient('test-key', 'https://api.anthropic.com');
    const result = await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Analyze this source' }],
      response_format: { type: 'json_object' },
    });

    expect(result).toContain('ok');
    const retry = getFullBody(mockRequestUrl.mock.calls.length - 1);
    expect(retry.messages.some(m => m.role === 'system')).toBe(false);
    expect(retry.messages.some(m => m.role === 'assistant')).toBe(false);
    expect(retry.system).toBe(SYSTEM_PROMPT);
  });

  it('AnthropicCompatibleClient: ingestion (system + json_object) succeeds after prefill fallback', async () => {
    mockRequestUrl.mockImplementation(anthropicPrefillSim('{"result":"ok"}'));

    const client = new AnthropicCompatibleClient('test-key', 'https://example.com/v1');
    const result = await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Analyze this source' }],
      response_format: { type: 'json_object' },
    });

    expect(result).toContain('ok');
    const retry = getFullBody(mockRequestUrl.mock.calls.length - 1);
    expect(retry.messages.some(m => m.role === 'system')).toBe(false);
    expect(retry.system).toBe(SYSTEM_PROMPT);
  });
});

describe('Anthropic thinking-disabled fallback with a system prompt (#141 regression)', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('AnthropicClient: thinking fallback keeps system top-level, no system role in messages', async () => {
    mockRequestUrl.mockImplementation(anthropicThinkingSim('hello'));

    const client = new AnthropicClient('test-key', 'https://api.anthropic.com');
    const result = await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Hi' }],
      enableThinking: false,
    });

    expect(result).toBe('hello');
    const fb = getFullBody(mockRequestUrl.mock.calls.length - 1);
    expect(fb.messages.some(m => m.role === 'system')).toBe(false);
    expect(fb.system).toBe(SYSTEM_PROMPT);
  });

  it('AnthropicCompatibleClient: thinking fallback keeps system top-level, no system role in messages', async () => {
    mockRequestUrl.mockImplementation(anthropicThinkingSim('hello'));

    const client = new AnthropicCompatibleClient('test-key', 'https://example.com/v1');
    const result = await client.createMessage({
      model: 'claude-opus-4-8',
      max_tokens: 100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Hi' }],
      enableThinking: false,
    });

    expect(result).toBe('hello');
    const fb = getFullBody(mockRequestUrl.mock.calls.length - 1);
    expect(fb.messages.some(m => m.role === 'system')).toBe(false);
    expect(fb.system).toBe(SYSTEM_PROMPT);
  });
});