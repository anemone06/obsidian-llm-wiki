import { describe, it, expect } from 'vitest';
import { fixDeadLink } from '../../../wiki/lint/fix-dead-link';
import { fillEmptyPage } from '../../../wiki/lint/fill-empty-page';
import { deleteEmptyStubs } from '../../../wiki/lint/delete-empty-stubs';
import { createMockContext } from '../../__support__/engine-context';

describe('lint cross-function integration', () => {
  it('fixDeadLink stub creation triggers fillEmptyPage expansion', async () => {
    const sourcePath = 'wiki/entities/source.md';
    const { ctx, vault } = createMockContext({
      vaultFiles: {
        [sourcePath]: '# Source\n\nSee [[BrandNewConcept]].\n',
      },
      llmResponses: [
        // fixDeadLink: ask to create a concept stub
        JSON.stringify({
          action: 'create_stub',
          stub_title: 'Brand New Concept',
          stub_type: 'concept',
        }),
        // fillEmptyPage: expanded content for the new stub
        '---\ntype: concept\ntags: [term]\n---\n# Brand New Concept\n\nThis is a detailed concept explanation with well over fifty characters of meaningful text.\n',
      ],
    });

    const result = await fixDeadLink(ctx, sourcePath, 'BrandNewConcept');

    expect(result).toMatch(/stub created and expanded/);
    const stubPath = 'wiki/concepts/brand-new-concept.md';
    const stubContent = vault.read(stubPath);
    expect(stubContent).not.toBeNull();
    expect(stubContent).toContain('# Brand New Concept');
    expect(stubContent).toContain('detailed concept explanation');

    const sourceUpdated = vault.read(sourcePath);
    expect(sourceUpdated).toContain('[[concepts/brand-new-concept|Brand New Concept]]');
    expect(sourceUpdated).not.toContain('[[BrandNewConcept]]');
  });

  it('fillEmptyPage expansion prevents deleteEmptyStubs from removing the page', async () => {
    const pagePath = 'wiki/entities/empty.md';
    const { ctx, vault } = createMockContext({
      vaultFiles: {
        [pagePath]: '---\ntype: entity\n---\n# Empty\n\nShort.\n',
      },
      llmResponses: [
        // fillEmptyPage: expanded content above the empty-page threshold
        '---\ntype: entity\ntags: [other]\n---\n# Empty\n\nThis entity page now contains a substantive body with well over fifty characters of meaningful text.\n',
      ],
    });

    await fillEmptyPage(ctx, pagePath);
    const result = await deleteEmptyStubs(ctx, 'wiki');

    expect(result.deleted).toBe(0);
    const pageContent = vault.read(pagePath);
    expect(pageContent).not.toBeNull();
    expect(pageContent).toContain('substantive body');
  });
});
