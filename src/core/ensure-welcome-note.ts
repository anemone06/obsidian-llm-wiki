// ensure-welcome-note.ts — v1.23.0 first-run Welcome note orchestrator
//
// Async side-effectful (file I/O). Glue between tier-detection,
// smoke-test, and welcome-note-template. The caller (main.ts onload)
// injects a real VaultAdapter over the Obsidian vault plus a smoke
// test probe that calls the actual LLM client. Tests inject fakes.
//
// The function does NOT show Notices — that is the caller's
// responsibility (main.ts hooks into the Obsidian Notice system).
// We return the OnboardingAction so the caller can decide what UI
// to surface (Notice, Modal, ribbon, etc.).

import { decideOnboardingAction, type VaultProbe, type OnboardingAction, type UserTier } from './tier-detection';
import { smokeTest, type LlmConfigStatus } from './smoke-test';
import { buildWelcomeNote, type VaultCandidate } from './welcome-note-template';

/**
 * Minimal vault contract that ensure-welcome-note needs. The real
 * Obsidian app.vault satisfies this; tests fake it.
 */
export interface VaultAdapter {
  exists(path: string): Promise<boolean>;
  listMarkdown(): Promise<VaultCandidate[]>;
  create(path: string, content: string): Promise<void>;
}

export interface EnsureWelcomeNoteArgs {
  vault: VaultAdapter;
  settings: {
    wikiFolder: string;
    createWelcomeNote: boolean;
  };
  i18n: { t: (key: string) => string };
  createdAt: string;
  /** Probe function passed to smokeTest. Production: minimal LLM call. */
  smokeTestProbe: () => Promise<LlmConfigStatus>;
  /**
   * Optional override for vault candidate list. If omitted, ensure-
   * welcome-note calls vault.listMarkdown(). Production callers
   * usually pass an explicit list (cached from a prior scan) for
   * performance; tests pass explicit fixtures.
   */
  vaultCandidates?: VaultCandidate[];
}

export interface EnsureResult {
  tier: UserTier;
  action: OnboardingAction;
  /** Path to the Welcome note if it was created. Undefined otherwise. */
  welcomeNotePath?: string;
}

export async function ensureWelcomeNote(args: EnsureWelcomeNoteArgs): Promise<EnsureResult> {
  const { vault, settings, i18n, createdAt, smokeTestProbe, vaultCandidates } = args;

  // Step 1: probe vault state.
  const probe = await probeVaultState(vault, settings.wikiFolder, vaultCandidates);
  // Step 2: decide tier.
  const action = decideOnboardingAction(probe);
  // Step 3: short-circuit on Tier A (no Welcome note) and Tier C
  // (silent upgrade).
  if (action.tier !== 'B-existing-vault' || !action.shouldCreateWelcomeNote) {
    return { tier: action.tier, action };
  }
  // Step 4: respect createWelcomeNote setting.
  if (!settings.createWelcomeNote) {
    return { tier: action.tier, action };
  }
  // Step 5: idempotent — skip if Welcome note already exists.
  const welcomePath = `${settings.wikiFolder}/Welcome.md`;
  if (await vault.exists(welcomePath)) {
    return { tier: action.tier, action, welcomeNotePath: welcomePath };
  }
  // Step 6: list vault candidates (if not provided).
  const candidates = vaultCandidates ?? await vault.listMarkdown();
  // Step 7: run LLM smoke test.
  const llmConfig = await smokeTest(smokeTestProbe);
  // Step 8: build the Welcome note body.
  const body = buildWelcomeNote({
    candidates,
    llmConfig,
    i18n,
    createdAt,
  });
  // Step 9: write to vault.
  await vault.create(welcomePath, body);
  return { tier: action.tier, action, welcomeNotePath: welcomePath };
}

async function probeVaultState(
  vault: VaultAdapter,
  wikiFolder: string,
  vaultCandidates: VaultCandidate[] | undefined,
): Promise<VaultProbe> {
  // Wiki folder is "present with pages" if any wiki page exists. We
  // treat a folder that exists but has no pages as Tier A (effectively
  // empty). Implementation: use the candidates list if provided, else
  // ask the vault. Wiki pages are a subset of all vault .md files
  // (those inside settings.wikiFolder).
  const allMd = vaultCandidates ?? await vault.listMarkdown();
  const wikiPages = allMd.filter(c => c.path.startsWith(`${wikiFolder}/`));
  const hasWikiFolder = wikiPages.length > 0;
  return {
    hasWikiFolder,
    wikiPageCount: wikiPages.length,
    vaultMdCount: allMd.length,
  };
}