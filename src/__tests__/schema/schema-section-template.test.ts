import { describe, it, expect } from 'vitest';
import { buildSchemaSectionTemplate } from '../../schema/schema-context';
import { buildDefaultSchemaBody } from '../../schema/schema-manager';
import { parseSchemaContext } from '../../schema/schema-context';

describe('buildSchemaSectionTemplate', () => {
  describe('default schema (backward compat — no behavior change)', () => {
    it('returns canonical entity sections when schema is default', () => {
      const ctx = parseSchemaContext(buildDefaultSchemaBody(), 'entity');
      const tpl = buildSchemaSectionTemplate(ctx, 'entity');
      // Default behavior: canonical entity sections (no change from v1.20.0)
      expect(tpl).toContain('## 基础信息');
      expect(tpl).toContain('## 描述');
      expect(tpl).toContain('## 相关实体');
      expect(tpl).toContain('## 相关概念');
      expect(tpl).toContain('## 原文提及');
    });

    it('returns canonical concept sections for concept page type', () => {
      const ctx = parseSchemaContext(buildDefaultSchemaBody(), 'concept');
      const tpl = buildSchemaSectionTemplate(ctx, 'concept');
      expect(tpl).toContain('## 定义');
      expect(tpl).toContain('## 关键特征');
      expect(tpl).toContain('## 应用场景');
    });

    it('returns canonical source sections for source page type', () => {
      const ctx = parseSchemaContext(buildDefaultSchemaBody(), 'source');
      const tpl = buildSchemaSectionTemplate(ctx, 'source');
      expect(tpl).toContain('## 摘要');
      expect(tpl).toContain('## 关键要点');
      expect(tpl).toContain('## 提及页面');
    });
  });

  describe('custom schema (user customization propagates)', () => {
    it('extracts section names from user-defined `**Sections:**` list', () => {
      const customBody = `# Wiki Schema

## 实体页面模板

**Sections:**
1. **Overview**: Single paragraph summary
2. **Timeline**: Chronological events
3. **Connections**: Related entities

## 概念页面模板

**Sections:**
1. **Definition**: Brief definition
2. **Examples**: Real-world examples

## My Custom Section

User added a new top-level section.
`;
      const ctx = parseSchemaContext(customBody, 'entity');
      // Sanity: hasUserSections should be true (My Custom Section not in defaults)
      expect(ctx.hasUserSections).toBe(true);
      const tpl = buildSchemaSectionTemplate(ctx, 'entity');
      // User's section names flow through
      expect(tpl).toContain('## Overview');
      expect(tpl).toContain('## Timeline');
      expect(tpl).toContain('## Connections');
      // Default sections should NOT appear when user customized
      expect(tpl).not.toContain('## 基础信息');
      expect(tpl).not.toContain('## 描述');
    });

    it('returns empty template when schema has no Entity Page Template section', () => {
      const body = '## 概念页面模板\n**Sections:**\n1. **Definition**: x';
      const ctx = parseSchemaContext(body, 'entity');
      const tpl = buildSchemaSectionTemplate(ctx, 'entity');
      // No Entity Page Template in body — fall back to canonical entity sections
      expect(tpl).toContain('## 基础信息');
    });
  });
});
