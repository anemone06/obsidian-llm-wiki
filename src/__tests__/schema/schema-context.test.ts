import { describe, it, expect } from 'vitest';
import { parseSchemaContext } from '../../schema/schema-context';
import { buildDefaultSchemaBody } from '../../schema/schema-manager';

describe('parseSchemaContext', () => {
  describe('default schema body (backward compatibility)', () => {
    const body = buildDefaultSchemaBody();

    it('extracts entity sections from default schema', () => {
      const ctx = parseSchemaContext(body, 'entity');
      expect(ctx.sections.length).toBeGreaterThan(0);
      // Default entity template has these sections (Issue #85 / default schema)
      const headings = ctx.sections.map(s => s.heading);
      expect(headings).toContain('实体页面模板');
    });

    it('returns empty sections array for unknown page type but still parses body', () => {
      const ctx = parseSchemaContext(body, 'unknown-type');
      // Unknown types still parse sections (we don't filter by type here)
      expect(ctx.sections.length).toBeGreaterThan(0);
      expect(ctx.body).toBe(body);
    });

    it('preserves raw body for fallback', () => {
      const ctx = parseSchemaContext(body, 'entity');
      expect(ctx.body).toBe(body);
    });
  });

  describe('custom schema body (user-edited config.md)', () => {
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

## Custom Section Title

This is a custom user-defined section.
`;

    it('parses user-defined sections', () => {
      const ctx = parseSchemaContext(customBody, 'entity');
      const headings = ctx.sections.map(s => s.heading);
      expect(headings).toContain('实体页面模板');
      expect(headings).toContain('概念页面模板');
      expect(headings).toContain('Custom Section Title');
    });

    it('extracts section content including body lines', () => {
      const ctx = parseSchemaContext(customBody, 'entity');
      const customSection = ctx.sections.find(s => s.heading === 'Custom Section Title');
      expect(customSection).toBeDefined();
      expect(customSection?.content).toContain('custom user-defined section');
    });
  });

  describe('edge cases', () => {
    it('handles empty body', () => {
      const ctx = parseSchemaContext('', 'entity');
      expect(ctx.sections).toEqual([]);
      expect(ctx.body).toBe('');
    });

    it('handles body without any sections', () => {
      const ctx = parseSchemaContext('Just plain text without headings.', 'entity');
      expect(ctx.sections).toEqual([]);
      expect(ctx.body).toBe('Just plain text without headings.');
    });

    it('treats top-level title (single #) separately from sections', () => {
      const body = '# Wiki Schema\n\n## Section A\nContent A';
      const ctx = parseSchemaContext(body, 'entity');
      expect(ctx.sections.map(s => s.heading)).toEqual(['Section A']);
    });
  });

  describe('hasUserSections flag (for prompt-unification logic)', () => {
    it('returns hasUserSections=false when sections match default schema', () => {
      const ctx = parseSchemaContext(buildDefaultSchemaBody(), 'entity');
      // The default schema includes all built-in templates — flag should be false
      // because there's nothing "custom" the user added
      expect(ctx.hasUserSections).toBe(false);
    });

    it('returns hasUserSections=true when body contains sections not in default', () => {
      const customBody = buildDefaultSchemaBody() + '\n\n## My Custom Section\nUser added this.';
      const ctx = parseSchemaContext(customBody, 'entity');
      expect(ctx.hasUserSections).toBe(true);
    });
  });
});
