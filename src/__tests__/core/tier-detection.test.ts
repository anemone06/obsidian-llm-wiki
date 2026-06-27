// Pure-function tests for tier-detection.ts
//
// The plugin auto-detects which user tier is present at plugin load
// (per the v1.23.0 three-tier first-run onboarding design, refined
// 2026-06-27). Each tier triggers a different onboarding behavior:
//
//   Tier A: empty vault → brief Notice only, no Welcome note.
//   Tier B: existing vault, no wiki → create Welcome.md with seed
//           suggestions, 5s Notice.
//   Tier C: existing wiki (v1.22.x upgrade) → no Welcome note, no
//           Notice, silent upgrade.
//
// All decision logic lives in decideOnboardingAction() — a pure
// function over VaultProbe. No Obsidian / I/O dependency.

import { describe, it, expect } from 'vitest';
import { decideOnboardingAction, type VaultProbe, type UserTier } from '../../core/tier-detection';

describe('decideOnboardingAction — Tier C (existing wiki)', () => {
  it('returns Tier C when wikiFolder exists and has pages', () => {
    const probe: VaultProbe = {
      hasWikiFolder: true,
      wikiPageCount: 50,
      vaultMdCount: 100,
    };
    const action = decideOnboardingAction(probe);
    expect(action.tier).toBe('C-existing-wiki');
    expect(action.shouldCreateWelcomeNote).toBe(false);
    expect(action.shouldShowNotice).toBe(false);
    expect(action.noticeMessage).toBeUndefined();
  });

  it('Tier C even with many vault notes (existing wiki is the marker, not vault count)', () => {
    const probe: VaultProbe = {
      hasWikiFolder: true,
      wikiPageCount: 3,   // even a small wiki triggers Tier C
      vaultMdCount: 500,
    };
    expect(decideOnboardingAction(probe).tier).toBe('C-existing-wiki');
  });
});

describe('decideOnboardingAction — Tier A (empty vault)', () => {
  it('returns Tier A when wikiFolder missing and vault has zero .md files', () => {
    const probe: VaultProbe = {
      hasWikiFolder: false,
      wikiPageCount: 0,
      vaultMdCount: 0,
    };
    const action = decideOnboardingAction(probe);
    expect(action.tier).toBe('A-empty-vault');
    expect(action.shouldCreateWelcomeNote).toBe(false);
    expect(action.shouldShowNotice).toBe(true);
    expect(action.noticeMessage).toBeDefined();
    expect(action.candidateSourceLimit).toBe(0);
  });

  it('Tier A notice mentions creating a source note', () => {
    const action = decideOnboardingAction({ hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 0 });
    expect(action.noticeMessage).toMatch(/source note/i);
  });
});

describe('decideOnboardingAction — Tier B (existing vault, no wiki)', () => {
  it('returns Tier B when wikiFolder missing and vault has 1+ .md files', () => {
    const probe: VaultProbe = {
      hasWikiFolder: false,
      wikiPageCount: 0,
      vaultMdCount: 1,
    };
    const action = decideOnboardingAction(probe);
    expect(action.tier).toBe('B-existing-vault');
    expect(action.shouldCreateWelcomeNote).toBe(true);
    expect(action.shouldShowNotice).toBe(true);
    expect(action.noticeMessage).toBeDefined();
    expect(action.candidateSourceLimit).toBeGreaterThan(0);
  });

  it('Tier B with many vault notes caps candidateSourceLimit at 10', () => {
    const action = decideOnboardingAction({
      hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 100,
    });
    expect(action.candidateSourceLimit).toBe(10);
  });

  it('Tier B with exactly 10 vault notes sets candidateSourceLimit to 10', () => {
    const action = decideOnboardingAction({
      hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 10,
    });
    expect(action.candidateSourceLimit).toBe(10);
  });

  it('Tier B with 5 vault notes sets candidateSourceLimit to 5', () => {
    const action = decideOnboardingAction({
      hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 5,
    });
    expect(action.candidateSourceLimit).toBe(5);
  });
});

describe('decideOnboardingAction — boundary cases', () => {
  it('wikiFolder missing, vaultMdCount > 0 → always Tier B (even if many)', () => {
    const action = decideOnboardingAction({
      hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 50,
    });
    expect(action.tier).toBe('B-existing-vault');
  });

  it('wikiFolder exists but is empty (no wiki pages) → Tier A (effectively empty wiki state)', () => {
    // wikiFolder exists but wikiPageCount = 0: this is a degenerate case
    // (user ran plugin once then deleted all wiki pages). Treat as
    // Tier A so the user gets a clean start, not silent corruption.
    const action = decideOnboardingAction({
      hasWikiFolder: true, wikiPageCount: 0, vaultMdCount: 0,
    });
    expect(action.tier).toBe('A-empty-vault');
  });

  it('wikiFolder exists with content but vault has many extra .md (Tier C wins — wiki is the marker)', () => {
    const action = decideOnboardingAction({
      hasWikiFolder: true, wikiPageCount: 20, vaultMdCount: 200,
    });
    expect(action.tier).toBe('C-existing-wiki');
  });
});

describe('decideOnboardingAction — invariants', () => {
  it('Tier A and Tier C never create Welcome note', () => {
    const tierA = decideOnboardingAction({ hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 0 });
    const tierC = decideOnboardingAction({ hasWikiFolder: true, wikiPageCount: 5, vaultMdCount: 0 });
    expect(tierA.shouldCreateWelcomeNote).toBe(false);
    expect(tierC.shouldCreateWelcomeNote).toBe(false);
  });

  it('only Tier B creates Welcome note', () => {
    const tiers: UserTier[] = ['A-empty-vault', 'B-existing-vault', 'C-existing-wiki'];
    for (const tier of tiers) {
      const probe = probeFor(tier);
      const action = decideOnboardingAction(probe);
      if (tier === 'B-existing-vault') {
        expect(action.shouldCreateWelcomeNote).toBe(true);
      } else {
        expect(action.shouldCreateWelcomeNote).toBe(false);
      }
    }
  });

  it('notice message present exactly when shouldShowNotice is true', () => {
    const cases: VaultProbe[] = [
      { hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 0 },
      { hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 5 },
      { hasWikiFolder: true, wikiPageCount: 5, vaultMdCount: 50 },
    ];
    for (const probe of cases) {
      const action = decideOnboardingAction(probe);
      if (action.shouldShowNotice) {
        expect(action.noticeMessage).toBeDefined();
        expect(action.noticeMessage!.length).toBeGreaterThan(0);
      } else {
        expect(action.noticeMessage).toBeUndefined();
      }
    }
  });

  it('candidateSourceLimit is 0 for Tier A and Tier C', () => {
    const tierA = decideOnboardingAction({ hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 0 });
    const tierC = decideOnboardingAction({ hasWikiFolder: true, wikiPageCount: 5, vaultMdCount: 10 });
    expect(tierA.candidateSourceLimit).toBe(0);
    expect(tierC.candidateSourceLimit).toBe(0);
  });
});

// Test helper
function probeFor(tier: UserTier): VaultProbe {
  switch (tier) {
    case 'A-empty-vault':
      return { hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 0 };
    case 'B-existing-vault':
      return { hasWikiFolder: false, wikiPageCount: 0, vaultMdCount: 7 };
    case 'C-existing-wiki':
      return { hasWikiFolder: true, wikiPageCount: 10, vaultMdCount: 5 };
  }
}