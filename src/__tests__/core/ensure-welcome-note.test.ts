// Integration tests for ensure-welcome-note.ts
//
// The orchestrator that decides whether to create the Welcome note
// and writes it to the vault. Combines:
//   - tier-detection (decide tier + onboarding action)
//   - smoke-test (LLM smoke check)
//   - welcome-note-template (render markdown)
//
// Dependency-inverted: instead of touching the Obsidian vault
// directly, the function takes a VaultAdapter interface that the
// caller (main.ts onload) implements with the real app.vault. Tests
// fake the adapter to assert behavior across the 3 tiers.

import { describe, it, expect } from 'vitest';
import { ensureWelcomeNote } from '../../core/ensure-welcome-note';
import type { VaultAdapter, VaultCandidate } from '../../core/ensure-welcome-note';

// Test i18n table — mirrors production English locale.
const testI18n = {
  t: (key: string): string => {
    const table: Record<string, string> = {
      'welcome.title': 'Welcome to your Wiki',
      'welcome.intro': 'Welcome intro.',
      'welcome.domains': 'Domains',
      'welcome.domains.description': 'List domains.',
      'welcome.initial_source_suggestions': 'Initial Source Suggestions',
      'welcome.initial_source_suggestions.description': 'Pick 2-3.',
      'welcome.wiki_scope': 'Wiki Scope',
      'welcome.wiki_scope.description': 'Describe.',
      'welcome.configuration_test': 'Configuration Test',
      'welcome.config_ok': 'LLM Configuration: OK',
      'welcome.config_provider': 'Provider',
      'welcome.config_model': 'Model',
      'welcome.config_failed': 'LLM Configuration: Failed',
      'welcome.config_error': 'Error',
    };
    return table[key] ?? key;
  },
};

// Test vault adapter — records what was written.
function makeFakeVault(initialFiles: Record<string, string> = {}): VaultAdapter & { written: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const adapter: VaultAdapter & { written: Map<string, string> } = {
    written: files,
    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },
    async listMarkdown(): Promise<VaultCandidate[]> {
      return [];
    },
    async create(path: string, content: string): Promise<void> {
      files.set(path, content);
    },
  };
  return adapter;
}

describe('ensureWelcomeNote — Tier A (empty vault)', () => {
  it('does NOT create welcome note (no source notes to seed from)', async () => {
    const vault = makeFakeVault();
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    expect(vault.written.has('wiki/Welcome.md')).toBe(false);
  });
});

describe('ensureWelcomeNote — Tier B (existing vault, no wiki)', () => {
  it('creates welcome note at <wikiFolder>/Welcome.md with seed suggestions', async () => {
    const vault = makeFakeVault();
    const candidates: VaultCandidate[] = [
      { path: 'notes/a.md', title: 'A', size: 5000 },
      { path: 'notes/b.md', title: 'B', size: 3000 },
    ];
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      vaultCandidates: candidates,
    });
    expect(vault.written.has('wiki/Welcome.md')).toBe(true);
    const content = vault.written.get('wiki/Welcome.md')!;
    expect(content).toMatch(/type:\s*welcome/);
    expect(content).toMatch(/notes\/a\.md/);  // seed candidate 1
    expect(content).toMatch(/notes\/b\.md/);  // seed candidate 2
    expect(content).toMatch(/OpenAI/);
  });

  it('skips creation if Welcome note already exists (idempotent)', async () => {
    const vault = makeFakeVault({ 'wiki/Welcome.md': 'existing content' });
    const candidates: VaultCandidate[] = [
      { path: 'notes/a.md', title: 'A', size: 5000 },
    ];
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      vaultCandidates: candidates,
    });
    // File should NOT be overwritten — content unchanged.
    expect(vault.written.get('wiki/Welcome.md')).toBe('existing content');
  });

  it('honors createWelcomeNote=false setting (skips creation)', async () => {
    const vault = makeFakeVault();
    const candidates: VaultCandidate[] = [
      { path: 'notes/a.md', title: 'A', size: 5000 },
    ];
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: false },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      vaultCandidates: candidates,
    });
    expect(vault.written.has('wiki/Welcome.md')).toBe(false);
  });

  it('surfaces LLM smoke test failure in the note body', async () => {
    const vault = makeFakeVault();
    const candidates: VaultCandidate[] = [
      { path: 'notes/a.md', title: 'A', size: 5000 },
    ];
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: false, error: 'API key not configured' }),
      vaultCandidates: candidates,
    });
    const content = vault.written.get('wiki/Welcome.md')!;
    expect(content).toMatch(/Failed/);
    expect(content).toMatch(/API key not configured/);
  });
});

describe('ensureWelcomeNote — Tier C (existing wiki)', () => {
  it('does NOT create welcome note when wiki already exists', async () => {
    const vault = makeFakeVault({ 'wiki/entities/A.md': '# Existing entity' });
    await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
      vaultCandidates: [],
    });
    expect(vault.written.has('wiki/Welcome.md')).toBe(false);
  });
});

describe('ensureWelcomeNote — return value', () => {
  it('returns the tier that was detected', async () => {
    const vault = makeFakeVault();
    const result = await ensureWelcomeNote({
      vault,
      settings: { wikiFolder: 'wiki', createWelcomeNote: true },
      i18n: testI18n,
      createdAt: '2026-06-27',
      smokeTestProbe: async () => ({ ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' }),
    });
    expect(result.tier).toBe('A-empty-vault');
  });
});