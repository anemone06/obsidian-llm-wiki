import { describe, it, expect } from 'vitest';
import { buildDefaultSchemaBody } from '../../schema/schema-manager';
import { LLMWikiSettings } from '../../types';

// Minimal settings object that satisfies the LLMWikiSettings fields touched
// by tag-vocab.ts. Only tagVocabularyMode and the custom tag fields are
// actually consumed by buildDefaultSchemaBody(settings).
function mkSettings(overrides: Partial<LLMWikiSettings>): LLMWikiSettings {
  return {
    tagVocabularyMode: 'default',
    customEntityTags: '',
    customConceptTags: '',
    ...overrides,
  } as LLMWikiSettings;
}

describe('buildDefaultSchemaBody', () => {
  const body = buildDefaultSchemaBody();

  it('includes all required page templates', () => {
    expect(body).toContain('## 实体页面模板');
    expect(body).toContain('## 概念页面模板');
    expect(body).toContain('## 来源页面模板');
  });

  it('Source Page Template documents the tags inheritance rule (Issue #90)', () => {
    // The source page tags MUST be inherited from the source note frontmatter,
    // not LLM-derived. This preserves the user's tag vocabulary.
    expect(body).toMatch(/## 来源页面模板[\s\S]*?tags.*继承/);
    expect(body).toMatch(/不要使用 LLM 提取出的概念名/);
  });

  it('Date Fields section documents that created/updated are programmatic, not LLM-generated', () => {
    expect(body).toContain('## 日期字段');
    // The rule: dates are filled by the system, not by the LLM
    expect(body).toMatch(/created[\s\S]*updated[\s\S]*系统自动填写/);
    expect(body).toMatch(/绝不由 LLM 生成|系统会在写入后覆盖/);
  });

  it('Mentions section uses academic-footnote style format', () => {
    // Expect: "Verbatim quote" — [[source-name|display-name]]
    expect(body).toMatch(/## 原文提及格式/);
    expect(body).toMatch(/-\s+"[^"]+"\s*—\s*\[\[/);
  });

  it('preserves all original section headings for backward compatibility', () => {
    expect(body).toContain('## Wiki 结构');
    expect(body).toContain('## 命名规范');
    expect(body).toContain('## 内容规则');
    expect(body).toContain('## 分类规则');
    expect(body).toContain('## 多来源合并规则');
    expect(body).toContain('## 维护策略');
  });

  it('preserves entity and concept subtype valid lists', () => {
    // Entity: person, organization, project, product, event, place, other
    expect(body).toMatch(/person[\s\S]*?organization[\s\S]*?project[\s\S]*?product[\s\S]*?event[\s\S]*?place[\s\S]*?other/);
    // Concept: theory, method, field, phenomenon, standard, term, other
    expect(body).toMatch(/theory[\s\S]*?method[\s\S]*?field[\s\S]*?phenomenon[\s\S]*?standard[\s\S]*?term[\s\S]*?other/);
  });
});

// === v1.22.0 Phase 2: Schema dynamic tag vocabulary sync ===
// Issue: when the user sets a Custom tag vocabulary in Settings, the hardcoded
// tag list in buildDefaultSchemaBody() conflicts with the active vocabulary
// the LLM is given via buildActiveTagVocabularySection(). The LLM sees two
// different tag lists and may produce out-of-vocabulary output.
//
// Fix: buildDefaultSchemaBody(settings) must inject the *active* tag list
// (driven by getActiveEntityTags / getActiveConceptTags) into the Entity
// Page Template and Concept Page Template, and into the Classification
// Rules section, so schema body and prompt section agree.
describe('buildDefaultSchemaBody(settings) — dynamic tag injection (v1.22.0 Phase 2)', () => {
  it('uses custom entity tags when tagVocabularyMode="custom" and customEntityTags is set', () => {
    // When the user has defined a custom entity vocabulary, the schema's
    // Entity Page Template MUST list those exact tags (not the hardcoded
    // defaults), so the LLM does not see a conflicting list.
    const custom = mkSettings({
      tagVocabularyMode: 'custom',
      customEntityTags: 'person, organization, Medical_Arzneimittel',
    });
    const body = buildDefaultSchemaBody(custom);
    // The custom tag is present in the entity tag list
    expect(body).toContain('Medical_Arzneimittel');
    // And in the Classification Rules section as well (consistency)
    expect(body).toMatch(/## 分类规则[\s\S]*?Medical_Arzneimittel/);
  });

  it('uses custom concept tags when tagVocabularyMode="custom" and customConceptTags is set', () => {
    const custom = mkSettings({
      tagVocabularyMode: 'custom',
      customConceptTags: 'Kardiologie, Arzneimittel/Neurologie',
    });
    const body = buildDefaultSchemaBody(custom);
    expect(body).toContain('Kardiologie');
    expect(body).toContain('Arzneimittel/Neurologie');
    // Slash-bearing tag must round-trip — getActiveConceptTags preserves '/'
    expect(body).toMatch(/## 概念页面模板[\s\S]*?Arzneimittel\/Neurologie/);
  });

  it('falls back to hardcoded defaults when settings are not provided (backward compat)', () => {
    // The zero-arg call (no settings) MUST continue to produce a schema
    // body containing the default entity and concept tag lists. This
    // preserves the existing public API used by ensureSchemaExists() at
    // first-ever load time when settings may not yet be persisted.
    const body = buildDefaultSchemaBody();
    expect(body).toMatch(/person[\s\S]*?organization[\s\S]*?project[\s\S]*?product[\s\S]*?event[\s\S]*?place[\s\S]*?other/);
    expect(body).toMatch(/theory[\s\S]*?method[\s\S]*?field[\s\S]*?phenomenon[\s\S]*?standard[\s\S]*?term[\s\S]*?other/);
  });

  it('falls back to hardcoded defaults when tagVocabularyMode="default" even if custom tags are set', () => {
    // tagVocabularyMode="default" is the explicit opt-out — the user wants
    // the built-in vocabulary, regardless of any stale custom*Tags content.
    const settings = mkSettings({
      tagVocabularyMode: 'default',
      customEntityTags: 'Medical_Arzneimittel', // should be IGNORED
    });
    const body = buildDefaultSchemaBody(settings);
    expect(body).not.toMatch(/## 实体页面模板[\s\S]*?Medical_Arzneimittel/);
    expect(body).toMatch(/## 实体页面模板[\s\S]*?person/);
  });

  it('Classification Rules entity subtypes list reflects the active entity tags', () => {
    // The Classification Rules section is referenced by the prompt as the
    // authoritative source of valid subtypes. It must agree with whatever
    // tag list is used in the Entity Page Template — otherwise the LLM
    // sees two different lists (the original Phase 1 gap).
    const custom = mkSettings({
      tagVocabularyMode: 'custom',
      customEntityTags: 'person, organization, Medical_Arzneimittel',
    });
    const body = buildDefaultSchemaBody(custom);
    // Extract the Classification Rules section and check it contains the
    // custom tag (not the old hardcoded list).
    const classMatch = body.match(/## 分类规则[\s\S]*?(?=\n## |\s*$)/);
    expect(classMatch).not.toBeNull();
    expect(classMatch![0]).toContain('Medical_Arzneimittel');
  });
});
