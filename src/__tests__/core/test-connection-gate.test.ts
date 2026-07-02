// test-connection-gate.test.ts
//
// v1.23.0 LM Studio hotfix (#214): verify that local providers (ollama,
// lmstudio) with empty apiKey bypass the gate in testLLMConnection,
// while cloud providers (openai, anthropic) still require a key.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import LLMWikiPlugin from '../../main';

// Mock the create-llm-client module so testLLMConnection doesn't
// try to dynamically import AI-SDK packages (which would fail in
// the test environment).
vi.mock('../../llm-sdk/create-llm-client', () => ({
  createLLMClientFromSettingsSync: vi.fn(() => ({
    createMessage: vi.fn().mockResolvedValue('ok'),
    createMessageStream: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
  })),
  preloadLLMClientModules: vi.fn().mockResolvedValue(undefined),
  _resetPreloadedModulesForTests: vi.fn(),
}));

describe('testLLMConnection — local provider API key gate', () => {
  const mockApp = {
    vault: {
      getAbstractFileByPath: vi.fn().mockReturnValue(null),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      read: vi.fn().mockResolvedValue(''),
    },
  };
  const mockManifest = {
    id: 'test-plugin',
    name: 'Test',
    version: '1.0.0',
    minAppVersion: '0.15.0',
  };
  let plugin: LLMWikiPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = new LLMWikiPlugin(mockApp as never, mockManifest as never);
    // Provide minimal settings required by testLLMConnection
    (plugin as unknown as Record<string, unknown>).settings = {
      provider: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5-7b',
      language: 'en',
      wikiFolder: 'wiki',
      llmReady: false,
      maxTokensPerCall: 0,
      autoIngestNotificationLevel: 'notice',
      autoWatchSources: false,
      startupCheck: false,
      slugCase: 'preserve',
    };
  });

  it('allows lmstudio provider with empty apiKey to bypass the gate (the fix)', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'lmstudio',
      apiKey: '',
    };

    const result = await plugin.testLLMConnection();

    // Should NOT return the apiKey error — if it bypasses the gate,
    // it reaches the mocked createLLMClient which returns success.
    expect(result.success).toBe(true);
  });

  it('allows ollama provider with empty apiKey to bypass the gate (existing behavior)', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'ollama',
      apiKey: '',
    };

    const result = await plugin.testLLMConnection();

    expect(result.success).toBe(true);
  });

  it('allows codex-cli provider with empty apiKey to bypass the gate', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'codex-cli',
      apiKey: '',
    };

    const result = await plugin.testLLMConnection();

    expect(result.success).toBe(true);
  });

  it('rejects openai provider with empty apiKey', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'openai',
      apiKey: '',
    };

    const result = await plugin.testLLMConnection();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/API Key/i);
  });

  it('rejects anthropic provider with empty apiKey', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'anthropic',
      apiKey: '',
    };

    const result = await plugin.testLLMConnection();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/API Key/i);
  });

  it('rejects gemini (openai-compatible) provider with empty apiKey', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'gemini',
      apiKey: '',
    };

    const result = await plugin.testLLMConnection();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/API Key/i);
  });

  it('allows lmstudio with a non-empty apiKey (normal config)', async () => {
    (plugin as unknown as Record<string, unknown>).settings = {
      ...(plugin as unknown as Record<string, unknown>).settings as Record<string, unknown>,
      provider: 'lmstudio',
      apiKey: 'some-key',
    };

    const result = await plugin.testLLMConnection();

    expect(result.success).toBe(true);
  });
});
