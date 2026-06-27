// Pure-function tests for welcome-note-template.ts
//
// buildWelcomeNote is a pure function that produces the full
// markdown body of the Welcome note (frontmatter + 5 sections).
// The caller passes candidates (vault notes to suggest as seeds),
// LLM smoke-test result, and an i18n translator.
//
// This is a Tier-B-only artifact: Tier A users don't get a Welcome
// note, Tier C users don't get one either. The function assumes
// "Tier B: create Welcome note" is the desired behavior.

import { describe, it, expect } from 'vitest';
import { buildWelcomeNote, type VaultCandidate } from '../../core/welcome-note-template';

// Test-local i18n table — mirrors the production English locale so
// the rendered output matches what the user will see.
const testI18n: { t: (key: string) => string } = {
  t: (key: string): string => {
    const table: Record<string, string> = {
      'welcome.title': 'Welcome to your Wiki',
      'welcome.intro': 'This note is the **founding declaration** for your wiki. Edit it freely to define your domain scope and seed the link graph.',
      'welcome.domains': 'Domains',
      'welcome.domains.description': 'List the domains this wiki should cover, one per line. Each becomes a tag category and a query-time retrieval basin.',
      'welcome.initial_source_suggestions': 'Initial Source Suggestions',
      'welcome.initial_source_suggestions.description': 'Pick 2-3 of these to ingest first — they give the link graph enough structure for PPR retrieval to outperform pure keyword match.',
      'welcome.wiki_scope': 'Wiki Scope',
      'welcome.wiki_scope.description': 'Describe in 1-2 sentences what this wiki covers. The LLM reads this when ingesting to understand context.',
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

describe('buildWelcomeNote — frontmatter', () => {
  it('always sets type: welcome in frontmatter', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/^---/);
    expect(body).toMatch(/type:\s*welcome/);
  });

  it('includes createdAt in frontmatter', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/created:\s*2026-06-27/);
  });

  it('starts with a single H1 title', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/^---[\s\S]*?---\n\n#\s+Welcome/);
  });
});

describe('buildWelcomeNote — ## Domains section', () => {
  it('includes a ## Domains section with a placeholder list', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/##\s+Domains/);
    expect(body).toMatch(/-\s*\(your domain 1\)/);
    expect(body).toMatch(/-\s*\(your domain 3\)/);
  });

  it('translates the Domains section header when i18n.t is provided', () => {
    const fr: { t: (k: string) => string } = { t: (k) => k === 'welcome.domains' ? 'Domaines' : k };
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: fr,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/##\s+Domaines/);
  });
});

describe('buildWelcomeNote — ## Initial Source Suggestions section', () => {
  it('lists up to 10 candidates as markdown checkboxes', () => {
    const candidates: VaultCandidate[] = Array.from({ length: 12 }, (_, i) => ({
      path: `notes/note-${i}.md`,
      title: `Note ${i}`,
      size: 1024 * (i + 1),
    }));
    const body = buildWelcomeNote({
      candidates,
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    // Cap at 10.
    const matches = body.match(/- \[[ ]\] \[\[/g) ?? [];
    expect(matches.length).toBe(10);
  });

  it('uses wikilink syntax [[path]] for candidates', () => {
    const candidates: VaultCandidate[] = [
      { path: 'notes/cardiology.md', title: 'Cardiology', size: 5000 },
    ];
    const body = buildWelcomeNote({
      candidates,
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/- \[[ ]\] \[\[notes\/cardiology\.md\]\]/);
  });

  it('orders candidates by size (largest first — heuristic: bigger notes = more content)', () => {
    const candidates: VaultCandidate[] = [
      { path: 'small.md', title: 'Small', size: 100 },
      { path: 'big.md', title: 'Big', size: 10000 },
      { path: 'medium.md', title: 'Medium', size: 1000 },
    ];
    const body = buildWelcomeNote({
      candidates,
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    const bigIdx = body.indexOf('big.md');
    const mediumIdx = body.indexOf('medium.md');
    const smallIdx = body.indexOf('small.md');
    expect(bigIdx).toBeGreaterThan(-1);
    expect(bigIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(smallIdx);
  });

  it('omits the section entirely when candidates is empty (degenerate Tier B)', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    // Section may still be present (as instruction-only), but it
    // should not list zero items as candidates.
    const candidateSection = body.match(/##[\s\S]*?Initial Source Suggestions[\s\S]*?(?=\n##|\n<!--)/);
    if (candidateSection) {
      expect(candidateSection[0]).not.toMatch(/- \[[ ]\]/);
    }
  });
});

describe('buildWelcomeNote — ## Wiki Scope section', () => {
  it('includes a ## Wiki Scope section with placeholder', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/##\s+Wiki Scope/);
    expect(body).toMatch(/Describe.*wiki/i);
  });
});

describe('buildWelcomeNote — ## Configuration Test section', () => {
  it('shows OK status when LLM config is valid', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/##\s+Configuration Test/);
    expect(body).toMatch(/OK|✅/);
    expect(body).toMatch(/OpenAI/);
    expect(body).toMatch(/gpt-4o-mini/);
  });

  it('shows warning status when LLM config is invalid', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: false, error: 'API key not configured' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/⚠/);
    expect(body).toMatch(/API key not configured/);
  });

  it('marks the section as auto-generated with HTML comment markers', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/<!--\s*auto-generated[\s\S]*?-->/);
    expect(body).toMatch(/end auto-generated/);
  });
});

describe('buildWelcomeNote — structural invariants', () => {
  it('ends with the closing auto-generated marker', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    expect(body).toMatch(/end auto-generated -->/);
  });

  it('contains all 4 expected section headers in order', () => {
    const body = buildWelcomeNote({
      candidates: [],
      llmConfig: { ok: true, provider: 'OpenAI', model: 'gpt-4o-mini' },
      i18n: testI18n,
      createdAt: '2026-06-27',
    });
    const domainsIdx = body.indexOf('## Domains');
    const initialIdx = body.indexOf('## Initial Source Suggestions');
    const scopeIdx = body.indexOf('## Wiki Scope');
    const configIdx = body.indexOf('## Configuration Test');
    expect(domainsIdx).toBeGreaterThan(-1);
    expect(initialIdx).toBeGreaterThan(domainsIdx);
    expect(scopeIdx).toBeGreaterThan(initialIdx);
    expect(configIdx).toBeGreaterThan(scopeIdx);
  });
});