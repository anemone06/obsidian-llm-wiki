// Integration tests for ensure-welcome-note.ts
//
// The orchestrator that decides whether to create the Welcome note
// and writes it to the vault. Combines:
//   - tier-detection (decide tier + onboarding action)
//   - smoke-test (LLM smoke check)
//   - welcome-note-template (render English markdown body)
//   - localize-welcome-note (D8: LLM-translate to user language)
//
// Dependency-inverted: instead of touching the Obsidian vault
// directly, the function takes a VaultAdapter interface that the
// caller (auto-maintain.ts Phase 0 + Recreate command) implements
// with the real app.vault. Tests fake the adapter.
//
// v1.23.0 refactor: VaultAdapter.listMarkdown() (with full VaultCandidate
// metadata) was removed because the Welcome template no longer
// renders an Initial Source Suggestions section. We use
// getMarkdownFiles() (just paths) for tier probing.

import { describe, it, expect, vi } from 'vitest';
import { ensureWelcomeNote } from '../../core/ensure-welcome-note';
import type { VaultAdapter } from '../../core/ensure-welcome-note';

// Test vault adapter — records what was written.
function makeFakeVault(initialFiles: Record<string, string> = {}): VaultAdapter & { written: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const adapter: VaultAdapter & { written: Map<string, string> } = {
    written: files,
    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },
    async getMarkdownFiles(): Promise<string[]> {
      // Vault state mirrors the written files (excluding the auto-managed
      // Welcome file so re-ingestion tests don't trigger Tier C). We
      // exclude ALL Welcome files (any language) for safety.
      return [...files.keys()].filter(p => !/Welcome.*\.md$/.test(p));
    },
    async create(path: string, content: string): Promise<void> {
      files.set(path, content);
    },
  };
  return adapter;
}

// v1.23.0 i18n: the Welcome filename is localized per language. For
// the default test fixture is Chinese, so it is "欢迎使用 YJY LLM Wiki".
// Tests that need to assert the exact path should use this helper.
const TEST_WELCOME_PATH = 'wiki/欢迎使用 YJY LLM Wiki.md';
const TEST_WELCOME_PATH_ZH = 'wiki/欢迎使用 YJY LLM Wiki.md';
const TEST_WELCOME_PATH_EN = 'wiki/Welcome to YJY LLM Wiki.md';

// Helper: returns a fake LLM client that always "translates" by
// prepending a marker. Tests can inspect the marker to confirm
// the translation was actually invoked.
function makeTranslatingClient(marker = '[ZH]') {
  return {
    createMessage: vi.fn().mockImplementation(async (params: { messages: Array<{role: string; content: string}> }) => {
      const userMsg = params.messages.find(m => m.role === 'user')?.content ?? '';
      return JSON.stringify({ translated: marker + userMsg });
    }),
  };
}

describe('ensureWelcomeNote — Tier A (empty vault)', () => {
  it('does NOT create welcome note when LLM is not configured', async () => {
    // Brand-new vault + no LLM → tier A short-circuits. The user
    // should run Configuration Test first; no Welcome is useful
    // without a working LLM.
    const vault = makeFakeVault();
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: false, error: 'no API key' }),
    });
    expect(vault.written.has(TEST_WELCOME_PATH)).toBe(false);
  });

  it('CREATES welcome note when LLM is configured (Tier A with-LLM path, v1.23.0 follow-up)', async () => {
    // New behavior: even in Tier A, if LLM is configured we create a
    // Welcome note so the LLM-only-onboarding user has a guided entry
    // point instead of just a "go create a source note" Notice.
    // tier-detection learns "LLM is available" from the llmClient arg
    // (no extra smoke test probe call for the tier decision).
    const vault = makeFakeVault();
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      llmClient: { createMessage: vi.fn().mockResolvedValue(JSON.stringify({ translated: 'TRANSLATED' })) },
      model: 'gpt-4o-mini',
    });
    expect(vault.written.has(TEST_WELCOME_PATH)).toBe(true);
  });
});

describe('ensureWelcomeNote — Tier B (existing vault, no wiki)', () => {
  it('creates welcome note at <wikiFolder>/Welcome.md', async () => {
    const vault = makeFakeVault();
    // Pre-existing non-wiki notes simulate Tier B state.
    vault.written.set('notes/a.md', '# A');
    vault.written.set('notes/b.md', '# B');
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    expect(vault.written.has(TEST_WELCOME_PATH)).toBe(true);
    const content = vault.written.get(TEST_WELCOME_PATH)!;
    expect(content).toMatch(/type:\s*welcome/);
    expect(content).toMatch(/OpenAI/);
  });

  it('skips creation if Welcome note already exists (idempotent)', async () => {
    const vault = makeFakeVault({ [TEST_WELCOME_PATH]: 'existing content' });
    vault.written.set('notes/a.md', '# A');
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    // File should NOT be overwritten — content unchanged.
    expect(vault.written.get(TEST_WELCOME_PATH)).toBe('existing content');
  });

  it('honors createWelcomeNote=false setting (skips creation)', async () => {
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: false },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    expect(vault.written.has(TEST_WELCOME_PATH)).toBe(false);
  });

  it('surfaces LLM smoke test failure in the note frontmatter (hidden metadata)', async () => {
    // v1.23.0 refactor (2026-06-28): LLM status is no longer rendered
    // into the visible body — it lives in frontmatter only. The user
    // sees the body as a clean reading guide; the install state is
    // hidden in frontmatter, and the verify section points them to
    // Settings → Test Connection for at-a-glance status.
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: false, error: 'API key not configured' }),
    });
    const content = vault.written.get(TEST_WELCOME_PATH)!;
    expect(content).toMatch(/^llm_config_status:\s*failed\s*$/m);
    expect(content).toMatch(/^llm_config_error:\s*"API key not configured"\s*$/m);
  });
});

describe('ensureWelcomeNote — D8 LLM dynamic translation', () => {
  it('translates the body when targetLanguage is not Chinese', async () => {
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    const llmClient = makeTranslatingClient('[TRANSLATED]');
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'en',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      llmClient: llmClient,
      model: 'gpt-4o-mini',
    });
    const content = vault.written.get(TEST_WELCOME_PATH_EN)!;
    expect(content).toMatch(/\[TRANSLATED\]/);
    expect(llmClient.createMessage).toHaveBeenCalled();
  });

  it('skips LLM translation when targetLanguage is zh (writes Chinese directly)', async () => {
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    const llmClient = makeTranslatingClient('[SHOULD_NOT_APPEAR]');
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      llmClient: llmClient,
      model: 'gpt-4o-mini',
    });
    expect(llmClient.createMessage).not.toHaveBeenCalled();
    const content = vault.written.get(TEST_WELCOME_PATH)!;
    expect(content).not.toMatch(/SHOULD_NOT_APPEAR/);
    expect(content).toMatch(/欢迎使用你的 LLM-Wiki/);
  });

  it('falls back to Chinese when LLM client throws during translation', async () => {
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    const llmClient = {
      createMessage: vi.fn().mockRejectedValue(new Error('rate limit')),
    };
    const result = await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'en',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      llmClient: llmClient,
      model: 'gpt-4o-mini',
    });
    const content = vault.written.get(TEST_WELCOME_PATH_EN)!;
    expect(content).toMatch(/欢迎使用你的 LLM-Wiki/);
    expect(result.localizeResult?.localized).toBe(false);
    expect(result.localizeResult?.error).toMatch(/rate limit/);
  });

  it('skips LLM translation when smoke test failed (no wasted LLM call)', async () => {
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    const llmClient = makeTranslatingClient();
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: false, error: 'API key not configured' }),
      llmClient: llmClient,
      model: 'gpt-4o-mini',
    });
    expect(llmClient.createMessage).not.toHaveBeenCalled();
    const content = vault.written.get(TEST_WELCOME_PATH_ZH)!;
    expect(content).toMatch(/欢迎使用你的 LLM-Wiki/);  // English, not Chinese
  });

  it('writes Chinese without LLM client when none is provided', async () => {
    const vault = makeFakeVault();
    vault.written.set('notes/a.md', '# A');
    const result = await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      // no llmClient
    });
    expect(result.localizeResult?.localized).toBe(false);
    const content = vault.written.get(TEST_WELCOME_PATH_ZH)!;
    expect(content).toMatch(/欢迎使用你的 LLM-Wiki/);
  });
});

describe('ensureWelcomeNote — Tier C (existing wiki)', () => {
  it('does NOT create welcome note when wiki already exists', async () => {
    // Existing wiki page → Tier C silent upgrade.
    const vault = makeFakeVault({ 'wiki/entities/A.md': '# Existing entity' });
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    expect(vault.written.has(TEST_WELCOME_PATH)).toBe(false);
  });
});

describe('ensureWelcomeNote — return value', () => {
  it('returns the tier that was detected', async () => {
    const vault = makeFakeVault();
    const result = await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      targetLanguage: 'zh',
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    expect(result.tier).toBe('A-empty-vault');
  });
});
