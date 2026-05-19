# LLM Wiki Plugin Project Development Standards

**Last Updated:** 2026-05-19

---

## Current Phase: v1.9.x — Second Quality Upgrade Round

Two independent audits both confirmed B+ rating. Next: P0 bug fixes, encapsulation, i18n, and tsc compliance.

### P0 — Immediate (in progress)
- Fix `renderComponent` → `activeRenderComponent` memory leak in QueryModal
- Fix `lintFixer` encapsulation (access via public method, not private property)
- Fix `testLLMConnection` hardcoded Chinese strings → TEXTS system
- Fix related entity/concept page generation: LLM must output `[[wiki-link]]` even for non-existent pages (currently outputs plain text → Lint misses dead links)
- Ensure `tsc --noEmit` passes

### P1 — Short-term
- PageFactory entity/concept method unification (8 pairs → generic)
- LLM client retry extraction (shared `withRetry`)
- `createMessageStream` language type consistency

### P2 — Medium-term
- `parseJsonResponse` + `mergeFrontmatter` unit tests
- `slugify` debug log reduction (8→2)
- Residual Chinese comment cleanup

### Already Evaluated (not doing)
- `getExistingWikiPages` cache bypass → Solve when it hurts
- `runLintWiki` 760-line method → Flat > Nested
- Custom YAML parser → Correct choice for Obsidian plugin constraints

---

## 📁 Project Structure

```
src/
├── main.ts                         # Plugin entry point
├── types.ts                        # Shared types + EngineContext
├── utils.ts                        # Utilities (slugify, parseJson, etc.)
├── texts.ts                        # i18n texts (barrel, 8 languages)
├── llm-client.ts                   # LLM clients
├── wiki/                           # Wiki engine
│   ├── wiki-engine.ts              # Orchestrator
│   ├── query-engine.ts             # Conversational query
│   ├── source-analyzer.ts          # Iterative batch extraction
│   ├── page-factory.ts             # Entity/concept CRUD + merge
│   ├── conversation-ingest.ts      # Chat → wiki knowledge
│   ├── lint-fixes.ts               # Fix logic
│   ├── lint-controller.ts          # Lint orchestration
│   ├── lint/                       # Lint sub-modules
│   ├── contradictions.ts           # Contradiction detection
│   ├── system-prompts.ts           # Language directive + labels
│   └── prompts/                    # LLM prompt templates
├── schema/                         # Schema co-evolution
├── ui/
│   ├── settings.ts                 # Settings panel
│   └── modals.ts                   # Lint/Ingest/Query modals
└── __tests__/                      # Unit tests (vitest, 53 tests)
```

---

## ⚠️ Git Safety Protocol

- **NEVER commit or push without explicit user permission.** Non-negotiable.

## 📦 Development Workflow

1. `pnpm lint && pnpm test && pnpm build` pass
2. Update relevant docs and memory
3. Present change summary for user review
4. Commit only after user approval
5. Push only after user approval

---

## 📋 Karpathy Philosophy Compliance

- **Knowledge compounds** — query results flow back into wiki
- **Human-in-the-loop** — LLM suggests, user decides
- **Three-layer architecture** — Sources → Wiki → Schema
- **Incremental accumulation** — wiki is persistent, not one-shot

## 🎯 Python Zen Design Principles

- **Simple > Complex** — comment not framework
- **Flat > Nested** — linear code beats micro-methods
- **Solve when it hurts** — don't optimize before measuring
- **Explicit > Implicit** — function types ARE documentation

## 🔑 Key Design Decisions

- **Tier 1/2 duplicate detection**: Tier 1 always verified (high-precision), Tier 2 fills token budget
- **`Promise.allSettled` error isolation**: One failure doesn't crash the batch
- **Pollution defense at write gate**: Centralized regex catches ALL sources
- **LLM semantic page selection**: Meaning-based matching, not keyword

---

## 🌍 Internationalization

- **UI**: 8 languages, 269+ fields
- **Wiki output**: 8 languages + custom input
- **Code**: English only, minimal comments

## 📋 Git Commit Standards

English, conventional commits. `feat:` `fix:` `docs:` `refactor:` `test:` `chore:`

## ✅ Pre-Commit Checklist

- `pnpm lint` (0 errors), `pnpm test` (all pass), `pnpm build` (clean), `npx tsc --noEmit` (0 errors)

- `pnpm lint` (0 errors), `pnpm test` (all pass), `pnpm build` (clean), `tsc --noEmit` (0 errors)

---

**Maintainer:** Greener-Dalii | **Repository:** green-dalii/obsidian-llm-wiki
