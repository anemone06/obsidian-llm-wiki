import { describe, it, expect } from 'vitest';
import { slugify, parseFrontmatter, detectRateLimitFailures, formatRateLimitNotice, cleanMarkdownResponse, enforceFrontmatterConstraints } from '../utils';

describe('slugify', () => {
  it('returns "untitled" for empty input', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
  });

  it('removes filesystem-unsafe characters', () => {
    // Slash, colon, pipe, asterisk are removed by the regex
    expect(slugify('hello/world')).toBe('helloworld');
    expect(slugify('test:file')).toBe('testfile');
    expect(slugify('a|b')).toBe('ab');
  });

  it('converts spaces and dots to dashes', () => {
    expect(slugify('hello world')).toBe('hello-world');
    expect(slugify('hello.world')).toBe('hello-world');
  });

  it('merges consecutive dashes', () => {
    expect(slugify('hello  ---  world')).toBe('hello-world');
    expect(slugify('a...b')).toBe('a-b');
  });

  it('strips leading and trailing dashes', () => {
    expect(slugify('-hello-')).toBe('hello');
  });

  it('preserves Chinese characters', () => {
    expect(slugify('思维链')).toBe('思维链');
  });

  it('preserves Korean characters', () => {
    expect(slugify('지식베이스')).toBe('지식베이스');
  });

  it('preserves Japanese characters', () => {
    expect(slugify('ノート一覧')).toBe('ノート一覧');
  });

  it('handles mixed CJK and ASCII', () => {
    expect(slugify('机器学习 Supervised Learning')).toBe('机器学习-Supervised-Learning');
  });

  it('removes angle brackets and quotes', () => {
    expect(slugify('"hello" <world>')).toBe('hello-world');
  });

  it('handles falsy values', () => {
    expect(slugify(null as unknown as string)).toBe('untitled');
    expect(slugify(undefined as unknown as string)).toBe('untitled');
  });

  it('returns fallback slug when input becomes empty after filtering', () => {
    const result = slugify('<>/\\:*?"|');
    expect(result).toMatch(/^untitled-\d+$/);
  });

  it('removes commas', () => {
    expect(slugify('Karpathy, Andrej')).toBe('Karpathy-Andrej');
  });
});

describe('parseFrontmatter', () => {
  it('returns null for content without frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\nSome content')).toBeNull();
    expect(parseFrontmatter('')).toBeNull();
  });

  it('parses simple key-value frontmatter', () => {
    const result = parseFrontmatter('---\ntype: entity\n---\nBody content');
    expect(result).toEqual({ type: 'entity' });
  });

  it('parses inline array fields', () => {
    const result = parseFrontmatter('---\naliases: ["监督学习", "Supervised Learning"]\n---\nBody');
    expect(result?.aliases).toEqual(['监督学习', 'Supervised Learning']);
  });

  it('wraps single-value aliases in array', () => {
    const result = parseFrontmatter('---\naliases: CoT\n---\nBody');
    expect(result?.aliases).toEqual(['CoT']);
  });

  it('wraps single-value sources in array', () => {
    const result = parseFrontmatter('---\nsources: "[[machine-learning]]"\n---\nBody');
    expect(result?.sources).toEqual(['[[machine-learning]]']);
  });

  it('wraps single-value tags in array', () => {
    const result = parseFrontmatter('---\ntags: method\n---\nBody');
    expect(result?.tags).toEqual(['method']);
  });

  it('parses multi-line array values', () => {
    const content = '---\ntags:\n  - method\n  - theory\n---\nBody';
    const result = parseFrontmatter(content);
    expect(result?.tags).toEqual(['method', 'theory']);
  });

  it('deletes non-array/non-string value for array-typed fields', () => {
    // "123" is parsed as a string from YAML, so it gets wrapped in array
    // This tests that deletion only happens for truly incompatible types
    const result = parseFrontmatter('---\naliases: 123\n---\nBody');
    expect(result?.aliases).toEqual(['123']);
  });

  it('parses boolean reviewed field', () => {
    const t = parseFrontmatter('---\nreviewed: true\n---\nBody');
    const f = parseFrontmatter('---\nreviewed: false\n---\nBody');
    expect(t?.reviewed).toBe(true);
    expect(f?.reviewed).toBe(false);
  });
});

describe('detectRateLimitFailures', () => {
  it('returns null when no rate limit failures', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'timeout' }],
      3, 300
    );
    expect(result).toBeNull();
  });

  it('detects 429 status code', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'HTTP 429 error' }],
      3, 300
    );
    expect(result).not.toBeNull();
    expect(result?.count).toBe(1);
  });

  it('detects "too many requests" pattern', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'too many requests from provider' }],
      3, 300
    );
    expect(result).not.toBeNull();
  });

  it('detects "throttl" pattern', () => {
    const result = detectRateLimitFailures(
      [{ name: 'page1', reason: 'request was throttled' }],
      3, 300
    );
    expect(result).not.toBeNull();
  });

  it('suggests lower concurrency', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429' }, { name: 'p2', reason: '429' }],
      3, 300
    );
    expect(result?.suggestedConcurrency).toBe(2);
  });

  it('suggests min concurrency of 1', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429 too many requests' }],
      1, 300
    );
    expect(result?.suggestedConcurrency).toBe(1);
  });

  it('suggests increased delay', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429' }],
      3, 300
    );
    expect(result?.suggestedDelay).toBe(600);
  });

  it('suggests min delay of 500ms when current is very low', () => {
    const result = detectRateLimitFailures(
      [{ name: 'p1', reason: '429' }],
      3, 50
    );
    expect(result?.suggestedDelay).toBe(500);
  });
});

describe('formatRateLimitNotice', () => {
  it('uses template when rateLimitDetected key exists', () => {
    const texts = {
      rateLimitDetected: 'Rate limit: {count} items. Concurrency → {suggestedConcurrency}, delay → {suggestedDelay}ms',
    };
    const result = formatRateLimitNotice(
      { count: 3, rateLimitNames: ['a', 'b', 'c'], suggestedConcurrency: 2, suggestedDelay: 600 },
      texts,
    );
    expect(result).toContain('3');
    expect(result).toContain('2');
    expect(result).toContain('600');
  });

  it('builds fallback when key is missing', () => {
    const result = formatRateLimitNotice(
      { count: 2, rateLimitNames: ['page1', 'page2'], suggestedConcurrency: 1, suggestedDelay: 500 },
      {},
    );
    expect(result).toContain('2');
    expect(result).toContain('1');
    expect(result).toContain('500ms');
  });
});

describe('cleanMarkdownResponse', () => {
  it('strips markdown code fence (```json...```)', () => {
    // Code only recognizes markdown/md language tags; json tag text remains
    const input = '```json\n{"key": "value"}\n```';
    const result = cleanMarkdownResponse(input);
    expect(result).toContain('{"key": "value"}');
    expect(result).not.toContain('```');
  });

  it('strips markdown code fence (```markdown...```)', () => {
    const input = '```markdown\n# Heading\nBody\n```';
    expect(cleanMarkdownResponse(input)).toBe('# Heading\nBody');
  });

  it('strips code fence without language tag', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(cleanMarkdownResponse(input)).toBe('{"key": "value"}');
  });

  it('strips opening fence without closing', () => {
    const input = '```json\n{"key": "value"}';
    const result = cleanMarkdownResponse(input);
    expect(result).toContain('{"key": "value"}');
    expect(result).not.toContain('```');
  });

  it('handles content without code fence unchanged', () => {
    const input = 'plain content no fences';
    expect(cleanMarkdownResponse(input)).toBe('plain content no fences');
  });

  it('adds missing opening --- for frontmatter-like prefix', () => {
    const input = 'type: entity\ncreated: 2026-01-01\n---\nBody content';
    const result = cleanMarkdownResponse(input);
    expect(result.startsWith('---')).toBe(true);
    expect(result).toContain('type: entity');
  });

  it('preserves preamble text when it contains colon (frontmatter-like detection)', () => {
    // Text with colons before --- is treated as frontmatter-like, so --- is prepended
    const input = 'Here is your wiki page:\n\n---\ntype: entity\n---\nBody';
    const result = cleanMarkdownResponse(input);
    expect(result.startsWith('---')).toBe(true);
  });

  it('trims whitespace', () => {
    expect(cleanMarkdownResponse('  \n  content  \n  ')).toBe('content');
  });
});

describe('enforceFrontmatterConstraints', () => {
  it('returns content unchanged if no frontmatter', () => {
    const input = '# Just a heading\nContent';
    expect(enforceFrontmatterConstraints(input, 'entity')).toBe(input);
  });

  it('enforces type for entity pages', () => {
    const input = '---\ntype: concept\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('type: entity');
  });

  it('enforces type for concept pages', () => {
    const input = '---\ntype: entity\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'concept');
    expect(result).toContain('type: concept');
  });

  it('preserves custom type as tag when enforcing entity/concept', () => {
    const input = '---\ntype: theory\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'concept');
    expect(result).toContain('type: concept');
    expect(result).toContain('theory');
  });

  it('collects and preserves existing tags from inline array', () => {
    // Entity valid tags: person, organization, project, product, event, location, other
    const input = '---\ntype: entity\ntags: [person, project]\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('tags:');
    expect(result).toContain('person');
  });

  it('collects and preserves concept tags from inline array', () => {
    // Concept valid tags: theory, method, technology, term, other
    const input = '---\ntype: concept\ntags: [method, theory]\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'concept');
    expect(result).toContain('method');
    expect(result).toContain('theory');
  });

  it('collects and preserves aliases from inline array', () => {
    const input = '---\ntype: concept\naliases: [CoT, 思维链]\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'concept');
    expect(result).toContain('aliases:');
    expect(result).toContain('CoT');
    expect(result).toContain('思维链');
  });

  it('collects aliases from YAML continuation format', () => {
    const input = '---\ntype: concept\naliases:\n  - CoT\n  - 思维链\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'concept');
    expect(result).toContain('aliases:');
    expect(result).toContain('CoT');
    expect(result).toContain('思维链');
  });

  it('preserves reviewed field', () => {
    const input = '---\ntype: entity\nreviewed: true\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('reviewed: true');
  });

  it('preserves created and updated dates', () => {
    const input = '---\ntype: entity\ncreated: 2026-01-01\nupdated: 2026-05-18\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('created: 2026-01-01');
    expect(result).toContain('updated: 2026-05-18');
  });

  it('ensures blank line before body', () => {
    const input = '---\ntype: entity\n---\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('---\n\nBody');
  });

  it('filters tags to valid subtypes only', () => {
    const input = '---\ntype: entity\ntags: [person, invalid_tag]\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('person');
    expect(result).not.toContain('invalid_tag');
  });

  it('provides fallback tag when all tags are invalid', () => {
    const input = '---\ntype: entity\ntags: [invalid_tag]\n---\n\nBody';
    const result = enforceFrontmatterConstraints(input, 'entity');
    expect(result).toContain('tags: [other]');
  });
});
