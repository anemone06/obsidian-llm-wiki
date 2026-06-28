// welcome-note-template.ts — First-run Welcome note generator (v1.23.0)
//
// Pure function. Renders the Welcome note body (English template) which
// the LLM then translates to the user's wiki language at write time
// (D8 design, see core/localize-welcome-note.ts).
//
// The v1.23.0 refactor simplifies the structure to two purposes only
// (decided 2026-06-28 after user feedback):
//
//   1. **Install verification** — the "Configuration Test" section.
//      If the user can read this note in their wiki language AND the
//      LLM Configuration is ✅ OK, the install is verified.
//
//   2. **Reading guide** — a multi-section explanation of how the
//      plugin works and what the wiki structure means. Pure read-only:
//      no editable form fields, no checkbox to tick, no domain
//      declarations. All "fill in here" affordances from earlier
//      designs were promises without consumers (no code path reads
//      the resulting content), so we removed them in favor of clarity.
//
// Removed in this refactor (vs v1):
//   - "Domains" section — no code consumed it; user feedback:
//     "user input is not necessary, just direct users to ingest".
//   - "Wiki Scope" section — same reason. Future ingest-context
//     wiring (read Welcome as LLM system prompt hint) deferred to
//     v1.24+ if there's real demand.
//   - "Initial Source Suggestions" section (with checkboxes) — the
//     checkboxes were dead code (no handler for "- [ ] [[path]]");
//     v1.23.0 ships the actual multi-file ingest command (see
//     #130) which makes the checkbox affordance obsolete.
//
// What this template DOES render:
//   - Frontmatter (type: welcome, created: ISO date, llm_config: machine-readable status)
//   - H1 title
//   - Intro paragraph
//   - "How to verify the install" — two green-lights check
//   - "How to use this plugin" — the 6 most-useful commands
//   - "What the wiki structure means" — entity / concept / source / Schema
//   - "Quick start" — 4-step first-time flow
//
// What this template does NOT render (v1.23.0 refactor):
//   - "Configuration Test" section with visible ✅/⚠ status, provider name,
//     model name, and HTML-comment markers. Reason: user feedback
//     2026-06-28 — visible status row breaks the reading flow and
//     "looks like debug output". LLM config state now lives in
//     frontmatter as `llm_config:` (machine-readable, hidden by default
//     in Obsidian's reading view). Install verification is the
//     responsibility of the plugin's own UI (Settings → Karpathy LLM
//     Wiki → LLM Provider → "Test Connection" button).
//
// D8 NOTE: All section headers and descriptions are English hardcoded
// here. Do NOT extract these into per-locale files. The LLM translator
// (localize-welcome-note.ts) will produce the localized version.
//
// LINE-BREAK NOTE: We use a separate string per visual line inside
// paragraphs (e.g. indented continuation text). The markdown source
// uses real newlines between them, but these are NORMAL newlines —
// Obsidian does NOT render a single trailing newline as a hard
// break, so the renderer auto-wraps to the viewport. This avoids the
// "premature hard-wrap" rendering bug introduced in the v1 draft.

export interface LlmConfigStatus {
  ok: boolean;
  provider?: string;
  model?: string;
  /** Set when ok=false. Human-readable reason (e.g. "API key not configured"). */
  error?: string;
}

export interface BuildWelcomeNoteArgs {
  llmConfig: LlmConfigStatus;
  /** ISO date for the frontmatter `created` field. */
  createdAt: string;
}

export function buildWelcomeNote(args: BuildWelcomeNoteArgs): string {
  const { llmConfig, createdAt } = args;

  const frontmatter = renderFrontmatter(llmConfig, createdAt);
  const title = 'Welcome to your LLM-Wiki';
  const intro = [
    'This note is generated automatically by the Karpathy LLM Wiki plugin on first run. It serves as a self-check and a quick reference — you don\'t need to edit it. After reading, use the command palette (`Ctrl/Cmd + P`) to run the Ingest commands and start building your wiki.',
    '',
    'Two ways to use this note:',
    '',
    '1. **Verify the install.** If you can read this in your wiki language, the LLM translation round-trip succeeded. To verify the LLM configuration itself, open **Settings → Karpathy LLM Wiki → LLM Provider** and click **Test Connection** — it must show ✅.',
    '2. **Read the structure guide.** Skim the "How to use this plugin" and "What the wiki structure means" sections to understand what you\'re about to ingest.',
  ].join('\n');
  const verifySection = renderVerifySection(llmConfig);
  const howToUseSection = renderHowToUseSection();
  const structureSection = renderStructureSection();
  const quickStartSection = renderQuickStartSection();

  const parts = [
    frontmatter,
    `# ${title}`,
    intro,
    verifySection,
    howToUseSection,
    structureSection,
    quickStartSection,
  ];

  return parts.filter(p => p.length > 0).join('\n\n') + '\n';
}

function renderFrontmatter(llmConfig: LlmConfigStatus, createdAt: string): string {
  const lines = [
    '---',
    'title: Wiki Founding Note',
    'type: welcome',
    `created: ${createdAt}`,
  ];
  // LLM configuration status, machine-readable only. Hidden in Obsidian
  // reading view by default. Keeps the body clean for the user while
  // still preserving a stable record of the install state at write time.
  lines.push(`llm_config_status: ${llmConfig.ok ? 'ok' : 'failed'}`);
  if (llmConfig.ok) {
    if (llmConfig.provider) lines.push(`llm_config_provider: ${llmConfig.provider}`);
    if (llmConfig.model) lines.push(`llm_config_model: ${llmConfig.model}`);
  } else if (llmConfig.error) {
    // Quote the error to be safe against YAML-special characters (':', '#', etc.).
    lines.push(`llm_config_error: "${llmConfig.error.replace(/"/g, '\\"')}"`);
  }
  lines.push('---');
  return lines.join('\n');
}

function renderVerifySection(llmConfig: LlmConfigStatus): string {
  if (llmConfig.ok) {
    return [
      '## How to verify the install',
      '',
      'Two green lights mean everything is working:',
      '',
      '1. **This note is in your wiki language.** If you can read it in the language you set in Settings → Wiki Language, the LLM translation round-trip succeeded.',
      '2. **The Configuration Test section below shows ✅ OK.** That means the LLM provider, API key, and model name are all valid.',
      '',
      'If either light is red, open Settings → LLM Provider and run **Test Connection** to see the actual error.',
    ].join('\n');
  }
  // LLM not configured — the user will see an English Welcome with a
  // ⚠️ Configuration Test. Give them the recovery steps.
  return [
    '## How to verify the install',
    '',
    'This note is shown in English because the LLM is not yet configured. To localize this note and enable wiki generation:',
    '',
    '1. Open **Settings → Karpathy LLM Wiki → LLM Provider**.',
    '2. Pick a provider, enter the API key, select a model.',
    '3. Click **Test Connection** — it must show ✅ before proceeding.',
    '4. Click **Save Settings**, then run the command palette command `Karpathy LLM Wiki: Recreate Wiki Welcome Note`.',
  ].join('\n');
}

function renderHowToUseSection(): string {
  return [
    '## How to use this plugin',
    '',
    'The plugin exposes six commands via the command palette (`Ctrl/Cmd + P`) plus a right-side Query panel. You don\'t need to memorise them — the first one below is the only one you need on day one.',
    '',
    '| Command | What it does | When to use it |',
    '| --- | --- | --- |',
    '| `Karpathy LLM Wiki: Ingest multiple files` | Pick N source notes via a two-pane picker; the plugin extracts entities / concepts / sources from each and writes wiki pages into your `wiki/` folder. | Day one. This is the entry point. |',
    '| `Karpathy LLM Wiki: Ingest single source` | Same as above, but for one file. | When you want to add a single note without opening the picker. |',
    '| `Karpathy LLM Wiki: Ingest from folder` | Ingests every file in a chosen folder. | When you have a folder of homogeneous notes (e.g. `inbox/2024/`) and want to process them all in one go. |',
    '| `Karpathy LLM Wiki: Query Wiki` | Opens the right-side chat panel for asking questions against the ingested content. | After at least a few pages are ingested. |',
    '| `Karpathy LLM Wiki: Lint wiki` | Runs the Lint pipeline (dead links, orphans, duplicate detection, sources normalization). | When the wiki has more than ~30 pages and you suspect drift. |',
    '| `Karpathy LLM Wiki: View Ingestion History` | Opens a panel showing what each previous Ingest call created/updated. | When you want to audit what a batch did. |',
    '| `Karpathy LLM Wiki: Recreate Wiki Welcome Note` | Deletes the current `Welcome.md` and re-creates it (translates the body to the current wiki language). | When you change the LLM configuration or the wiki language. |',
    '',
    'A few non-command affordances also matter:',
    '',
    '- **The right-side Query panel** is opened by the Query Wiki command above, or by clicking the chat-bubble ribbon icon. It stays open across notes.',
    '- **The status bar** at the bottom of Obsidian shows ingest progress (`Ingesting 3/12: notes/foo.md`) and the wiki ingestion history summary.',
    '- **The Operation History Panel** is opened by the View Ingestion History command. It is the only place the plugin logs the result of every Ingest call across sessions.',
    '- **All ingest results** also produce a Notice (transient 5-10s toast in the top-right).',
  ].join('\n');
}

function renderStructureSection(): string {
  return [
    '## What the wiki structure means',
    '',
    'After you ingest a source note, the plugin creates a small set of pages in your `wiki/` folder. Understanding the three core types (and the Schema layer on top) is the single most useful piece of background for the day you start curating the wiki by hand.',
    '',
    '### The three core page types',
    '',
    'Every source note is parsed into a set of wiki pages. The plugin writes one page per type:',
    '',
    '- **`entities/`** — People, organizations, projects, products, events, places, or any other "named thing" the LLM found in the source. A single source note typically produces several entity pages (e.g. one per person mentioned). Each entity page holds: aliases the LLM detected, a summary, the source notes it appears in (`mentions_in_source`), and links to related entities and concepts.',
    '- **`concepts/`** — Topical ideas, methods, definitions, fields of study, recurring themes. "PPR", "cardiology", "schema-driven design" are all concepts. Concepts are how the wiki "knows about topics" — entity pages link to concept pages, and concept pages link to other concept pages.',
    '- **`sources/`** — One page per ingested source note. The body of a source page is the original note content, plus a `source_file` frontmatter field pointing back to the original `.md` path. Source pages are the provenance anchor: every entity / concept page lists the source pages that mention it, so a reader can always drill from a topic back to the originating note.',
    '',
    '### The Schema layer',
    '',
    'On top of the three core types, the plugin can maintain a `wiki/schema/` folder that encodes your wiki\'s vocabulary — the controlled list of tag categories, section templates, and entity/concept types that your wiki uses. You can opt in or out per-vault in Settings → Karpathy LLM Wiki → Schema. When enabled:',
    '',
    '- The plugin will suggest Schema updates when it notices drift (e.g. your ingested notes keep introducing a new concept that isn\'t in the vocabulary). The suggestion lives in the Lint report modal — you accept / reject before it lands.',
    '- Your ingest prompts are bound to the vocabulary, so the LLM picks tags and section headings from a fixed list rather than inventing free-form text. This is what makes the wiki queryable.',
    '- When you change the vocabulary, every existing page is rewritten to match (auto-backup to `.llm-wiki-backups/schema/`).',
    '',
    'If you don\'t enable Schema, the plugin still works — the three core types are always created — but the wiki has less structure for the LLM to lean on at query time.',
    '',
    '### The wikilink graph',
    '',
    'Every `[[wiki-link]]` between two pages is an explicit relationship that the LLM established at ingest time. The Karpathy Wiki plugin uses this graph (not embeddings) for query retrieval — see the v1.23.0 release notes for the graph engine architecture. The practical implication for you: a well-curated wikilink graph is the wiki\'s "search index". You can add or edit `[[X]]` links by hand in any page, and the next query will pick them up.',
    '',
    '### Where to find each type',
    '',
    'All wiki files live under `wiki/` (configurable in Settings → Karpathy LLM Wiki → Wiki folder). The default layout:',
    '',
    '```',
    'wiki/',
    '├── entities/    # Named things (people, orgs, projects, etc.)',
    '├── concepts/    # Topics, methods, definitions',
    '├── sources/     # One page per ingested note (provenance)',
    '├── schema/      # Optional vocabulary + section templates',
    '├── index.md     # The auto-generated graph index',
    '└── log.md       # The auto-generated activity log',
    '```',
  ].join('\n');
}

function renderQuickStartSection(): string {
  return [
    '## Quick start (4 steps)',
    '',
    '1. **Pick source notes to ingest.**',
    'Open the command palette and run `Karpathy LLM Wiki: Ingest multiple files`. Multi-select the notes you want to turn into wiki pages. Press Enter to start. The plugin processes them sequentially; you\'ll see progress in the status bar.',
    '',
    '2. **Wait for ingest to finish.**',
    'Each note takes 10-60 seconds (LLM extraction). You can keep working — the plugin reports completion in a Notice. View the Ingestion History Panel (`Karpathy LLM Wiki: View Ingestion History`) to inspect what was created.',
    '',
    '3. **Try a query.**',
    'Open the right-side Query Wiki panel (ribbon icon: chat bubble) and ask something about your ingested content. The panel streams the answer.',
    '',
    '4. **Tune settings as needed.**',
    'Settings → Karpathy LLM Wiki: language, wiki folder, wiki output language, schema, tag vocabulary, auto-watch. Defaults are sensible for new vaults.',
    '',
    '> More in the README: github.com/green-dalii/obsidian-llm-wiki',
  ].join('\n');
}