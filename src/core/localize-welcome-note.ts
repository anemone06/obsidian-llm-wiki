// localize-welcome-note.ts — D8 Welcome note LLM dynamic translation
//
// v1.23.0 design (D8, user-locked 2026-06-23):
//   - Welcome content = 1 English template (no 10-locale hardcoded i18n)
//   - At write time, the plugin LLM-translates the body into the user's
//     `wikiLanguage` if the LLM is configured and reachable.
//   - On LLM failure, fall back to writing the English template (so the
//     user always gets a usable note) and surface the error so the caller
//     can show a "Run Configuration Test" Notice.
//
// Why a separate module from ensure-welcome-note:
//   - Pure translation logic with no vault dependency → easy to unit test
//   - The orchestrator (ensure-welcome-note) keeps single responsibility
//     (probe vault → tier → smoke-test → render → write)
//   - Recreate Welcome Note command can re-use the same translation
//     helper without going through the tier-detection path.
//
// Fallback chain (in this order):
//   1. targetLanguage === 'en' → return English body, no LLM call
//   2. LLM call succeeds + returns parseable JSON with `translated` → use it
//   3. LLM throws OR returns invalid/empty → fall back to English body +
//      populate `error` field so the caller can surface a Notice

import type { LLMClient } from '../types';

/**
 * Optional pre-allocated max_tokens. Translation of the Welcome note
 * body is bounded (~600 tokens), but we use 1500 to leave room for
 * JSON wrapping overhead and the LLM's tendency to add a small amount
 * of preamble prose.
 */
const TRANSLATION_MAX_TOKENS = 1500;

export interface LocalizeArgs {
  /** English body produced by buildWelcomeNote. Will be translated if targetLanguage ≠ 'en'. */
  englishBody: string;
  /**
   * Target language code. Standard codes ('en', 'zh', 'ja', ...) or a
   * custom string (user's wikiLanguage setting). 'en' short-circuits
   * the LLM call entirely.
   */
  targetLanguage: string;
  /** LLM client to use for the translation request. Required. */
  llmClient: LLMClient;
  /** Model name to pass to the LLM. */
  model: string;
  /** Optional AbortSignal to cancel the in-flight LLM call. */
  signal?: AbortSignal;
}

export interface LocalizeResult {
  /** True if we got a usable translated body. False on LLM failure (English fallback used). */
  ok: boolean;
  /**
   * The final body to write to the vault. Either the LLM-translated
   * body (ok=true) or the original English body (ok=false).
   */
  body: string;
  /**
   * True if `body` is the LLM-translated content. False if it's the
   * English fallback. Useful for the caller's "Run Configuration Test"
   * Notice decision.
   */
  localized: boolean;
  /**
   * Set when ok=false. Human-readable reason for the failure. Used by
   * the caller to populate the "Run Configuration Test" Notice.
   */
  error?: string;
}

/**
 * Map of language codes to human-readable language names. Used to
 * instruct the LLM which language to translate into. Falls back to
 * passing the code itself for unknown / custom languages.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
};

/**
 * Translate an English Welcome note body into the user's wikiLanguage.
 * Falls back to the English body on any LLM failure (so the user always
 * gets a usable note).
 *
 * NEVER throws. All errors are caught and converted to LocalizeResult.
 */
export async function localizeWelcomeNote(args: LocalizeArgs): Promise<LocalizeResult> {
  const { englishBody, targetLanguage, llmClient, model, signal } = args;

  // Short-circuit: English is the source. Skip the LLM call entirely.
  if (!targetLanguage || targetLanguage === 'en') {
    return { ok: true, body: englishBody, localized: false };
  }

  const languageName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
  const system = [
    'You are a translation engine for a personal knowledge-management wiki plugin.',
    `Translate the user's Markdown document into ${languageName}.`,
    'Preserve all Markdown syntax verbatim: headings (##, ###), bullet lists, checkboxes (- [ ] / - [x]), blockquotes (>),',
    'horizontal rules (---), inline code (`...`), fenced code blocks (```...```), and HTML comments (<!-- ... -->).',
    'Preserve all [[wiki-links]] exactly as written (do not translate the target path).',
    'Preserve frontmatter (--- at start and end) verbatim — only translate the `title` value if present.',
    'Preserve the closing <!-- end auto-generated --> marker.',
    'Respond with a single JSON object: {"translated": "<full translated markdown>"}. No prose before or after.',
  ].join(' ');

  try {
    const raw = await llmClient.createMessage({
      model,
      max_tokens: TRANSLATION_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: englishBody }],
      // Note: no signal param in current LLMClient interface, but caller
      // can pass signal via signal on the request and we ignore at this
      // level. Future: plumb through AbortSignal once interface widens.
      ...(signal ? {} : {}),
    });

    const translated = extractTranslatedField(raw);
    if (!translated) {
      return {
        ok: false,
        body: englishBody,
        localized: false,
        error: 'LLM response did not contain a valid `translated` field',
      };
    }

    return { ok: true, body: translated, localized: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      body: englishBody,
      localized: false,
      error: message,
    };
  }
}

/**
 * Extract the `translated` field from an LLM response. Tolerant of
 * common variations:
 *   - Plain JSON: {"translated": "..."}
 *   - Wrapped in prose: "Sure, here is: {..."}
 *   - Stray code fences (rarely, but possible)
 */
function extractTranslatedField(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Try direct JSON parse first.
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj && typeof obj === 'object' && 'translated' in obj) {
      const translated = (obj as Record<string, unknown>).translated;
      if (typeof translated === 'string') {
        return translated;
      }
    }
  } catch {
    // Fall through to prose-wrapped extraction.
  }

  // Look for the JSON object containing `translated`. We locate the
  // opening `{` immediately before the `"translated"` key, then walk
  // the string to find its matching closing `}` (respecting JSON
  // string escaping so escaped quotes inside the value don't end the
  // match early).
  const keyIndex = raw.indexOf('"translated"');
  if (keyIndex === -1) return null;

  // Find the `{` that starts this object — scan backwards from the key.
  let openBrace = -1;
  for (let i = keyIndex - 1; i >= 0; i--) {
    const ch = raw[i];
    if (ch === '{') { openBrace = i; break; }
    if (ch === '}' || ch === ']' || ch === ',') return null;  // key not at object start
  }
  if (openBrace === -1) return null;

  // Walk forward from openBrace, tracking string state + escapes, to
  // find the matching closing `}`.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openBrace; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(openBrace, i + 1);
        try {
          const obj: unknown = JSON.parse(candidate);
          if (obj && typeof obj === 'object' && 'translated' in obj) {
            const translated = (obj as Record<string, unknown>).translated;
            if (typeof translated === 'string') {
              return translated;
            }
          }
        } catch {
          return null;
        }
        return null;
      }
    }
  }
  return null;
}