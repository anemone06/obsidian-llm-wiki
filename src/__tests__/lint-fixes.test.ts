import { describe, it, expect } from 'vitest';
import { isPageEmpty, detectPollutedPages } from '../wiki/lint-fixes';

describe('isPageEmpty', () => {
  it('detects stub marker as empty', () => {
    const content = '---\ntype: entity\ntags: [other]\n---\n\n> Auto-generated stub page — referenced by [[sources/some-file]].\n';
    expect(isPageEmpty(content)).toBe(true);
  });

  it('detects content under 50 characters as empty', () => {
    const content = '---\ntype: entity\n---\n\nShort text';
    expect(isPageEmpty(content)).toBe(true);
  });

  it('detects content over 50 characters as not empty', () => {
    const content = '---\ntype: entity\n---\n\n' + 'A'.repeat(60);
    expect(isPageEmpty(content)).toBe(false);
  });

  it('handles content without frontmatter', () => {
    const content = 'Bare markdown content that is long enough to pass the threshold test reliably.';
    expect(isPageEmpty(content)).toBe(false);
  });

  it('detects empty content as not empty when comment strip leaves many chars', () => {
    const content = '---\ntype: entity\n---\n\nThis is a real paragraph with enough characters to pass the check without any doubt.';
    expect(isPageEmpty(content)).toBe(false);
  });
});

describe('detectPollutedPages', () => {
  it('detects polluted basename with CJK characters', () => {
    const pages = [
      { path: 'wiki/concepts/concepts布局优化.md', title: 'concepts布局优化' },
    ];
    const result = detectPollutedPages(pages);
    expect(result).toHaveLength(1);
    expect(result[0].cleanTitle).toBe('布局优化');
  });

  it('detects polluted basename with ASCII letters', () => {
    const pages = [
      { path: 'wiki/entities/entities张三.md', title: 'entities张三' },
    ];
    const result = detectPollutedPages(pages);
    expect(result).toHaveLength(1);
    expect(result[0].cleanTitle).toBe('张三');
  });

  it('ignores clean basenames with separators', () => {
    const pages = [
      { path: 'wiki/concepts/Concepts-of-ML.md', title: 'Concepts-of-ML' },
      { path: 'wiki/concepts/Sources-list.md', title: 'Sources-list' },
    ];
    const result = detectPollutedPages(pages);
    expect(result).toHaveLength(0);
  });

  it('returns empty for clean pages', () => {
    const pages = [
      { path: 'wiki/entities/Qwen.md', title: 'Qwen' },
      { path: 'wiki/concepts/Attention.md', title: 'Attention' },
    ];
    const result = detectPollutedPages(pages);
    expect(result).toHaveLength(0);
  });

  it('handles empty input', () => {
    const result = detectPollutedPages([]);
    expect(result).toHaveLength(0);
  });

  it('filters polluted from mixed pages', () => {
    const pages = [
      { path: 'wiki/entities/Qwen.md', title: 'Qwen' },
      { path: 'wiki/concepts/concepts布局优化.md', title: 'concepts布局优化' },
      { path: 'wiki/sources/sources张三.md', title: 'sources张三' },
    ];
    const result = detectPollutedPages(pages);
    expect(result).toHaveLength(2);
    expect(result[0].cleanTitle).toBe('布局优化');
    expect(result[1].cleanTitle).toBe('张三');
  });
});
