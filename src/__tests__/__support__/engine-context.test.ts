import { describe, it, expect } from 'vitest';
import { createMockContext } from './engine-context';

// Regression tests for the mock's aliases parsing behavior.
//
// The previous mock used an inline-only regex `aliases:\s*\[([^\]]*)\]`
// that silently dropped multi-line aliases (the most common format in
// real vaults). This caused tests to pass with `aliases: undefined`
// while production parsed them correctly — a classic shell-test failure
// mode that hides integration bugs.

describe('createMockContext — getExistingWikiPages aliases parsing', () => {
  it('parses inline aliases: [A, B] format', async () => {
    const { ctx } = createMockContext({
      vaultFiles: {
        'wiki/entities/Alpha.md': [
          '---',
          'type: entity',
          'aliases: ["Alpha One", "Alpha Two"]',
          '---',
          '',
          '# Alpha',
          '',
        ].join('\n'),
      },
    });
    const pages = await ctx.getExistingWikiPages();
    expect(pages[0].aliases).toEqual(['Alpha One', 'Alpha Two']);
  });

  it('parses multi-line aliases format (regression)', async () => {
    // Multi-line is the format produced by enforceFrontmatterConstraints
    // and many existing vault pages. The mock MUST recognize it.
    const { ctx } = createMockContext({
      vaultFiles: {
        'wiki/entities/Alpha.md': [
          '---',
          'type: entity',
          'aliases:',
          '  - "Alpha One"',
          '  - "Alpha Two"',
          '---',
          '',
          '# Alpha',
          '',
        ].join('\n'),
      },
    });
    const pages = await ctx.getExistingWikiPages();
    expect(pages[0].aliases).toEqual(['Alpha One', 'Alpha Two']);
  });

  it('omits aliases when not present in frontmatter', async () => {
    const { ctx } = createMockContext({
      vaultFiles: {
        'wiki/entities/Alpha.md': [
          '---',
          'type: entity',
          '---',
          '',
          '# Alpha',
          '',
        ].join('\n'),
      },
    });
    const pages = await ctx.getExistingWikiPages();
    expect(pages[0].aliases).toBeUndefined();
  });
});
