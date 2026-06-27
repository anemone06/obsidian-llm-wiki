// tier-detection.ts — v1.23.0 three-tier first-run onboarding
//
// Pure function. Decides which onboarding behavior to apply at plugin
// load based on the current state of the vault.
//
// Tiers (per the v1.23.0 design, refined 2026-06-27):
//   A-empty-vault:     no wiki folder, no .md files in vault. Notice only.
//   B-existing-vault:  no wiki folder, vault has .md files. Create
//                      Welcome note with seed candidates.
//   C-existing-wiki:   wiki folder exists with pages. Silent upgrade.
//
// The function is a pure mapping (VaultProbe → OnboardingAction) so
// it can be tested without an Obsidian dependency. The caller is
// responsible for producing a VaultProbe by reading the actual vault
// state.

export type UserTier = 'A-empty-vault' | 'B-existing-vault' | 'C-existing-wiki';

export interface VaultProbe {
  /** True when settings.wikiFolder exists in the vault and is a directory. */
  hasWikiFolder: boolean;
  /** Number of .md files inside settings.wikiFolder (entities + concepts + sources + index.md + log.md). */
  wikiPageCount: number;
  /** Total .md files anywhere in the vault (top-level + subdirectories, excluding .obsidian). */
  vaultMdCount: number;
}

export interface OnboardingAction {
  tier: UserTier;
  shouldCreateWelcomeNote: boolean;
  shouldShowNotice: boolean;
  /** Human-readable notice text. Only present when shouldShowNotice is true. */
  noticeMessage?: string;
  /** Number of vault source notes to surface in Welcome note's `## Initial Source Suggestions` section. 0 for Tier A/C. */
  candidateSourceLimit: number;
}

const CANDIDATE_LIMIT_CAP = 10;

const NOTICE_TIER_A =
  'Karpathy Wiki: vault is empty. Create your first source note and run Ingest to get started.';
const NOTICE_TIER_B =
  'Karpathy Wiki: created a Welcome note. Open it to declare your domains and pick 2-3 source notes to seed the link graph.';

export function decideOnboardingAction(probe: VaultProbe): OnboardingAction {
  // Tier A: vault is effectively empty — no wiki content AND no other
  // .md files anywhere. Either wikiFolder is missing entirely, or it
  // exists but has zero pages (degenerate state after user deleted
  // everything). Either way, the user has nothing to seed from.
  if (probe.vaultMdCount === 0) {
    return {
      tier: 'A-empty-vault',
      shouldCreateWelcomeNote: false,
      shouldShowNotice: true,
      noticeMessage: NOTICE_TIER_A,
      candidateSourceLimit: 0,
    };
  }

  // Tier C: existing wiki. The wikiFolder exists AND has content —
  // silent upgrade, no onboarding interruptions. Note we check this
  // BEFORE Tier B: if the user has a wiki, we don't intrude on their
  // existing context even if their vault also has loose .md files.
  if (probe.hasWikiFolder && probe.wikiPageCount > 0) {
    return {
      tier: 'C-existing-wiki',
      shouldCreateWelcomeNote: false,
      shouldShowNotice: false,
      candidateSourceLimit: 0,
    };
  }

  // Tier B: existing vault without wiki. Create Welcome note with
  // seed suggestions. Cap candidate count at CANDIDATE_LIMIT_CAP.
  return {
    tier: 'B-existing-vault',
    shouldCreateWelcomeNote: true,
    shouldShowNotice: true,
    noticeMessage: NOTICE_TIER_B,
    candidateSourceLimit: Math.min(CANDIDATE_LIMIT_CAP, probe.vaultMdCount),
  };
}