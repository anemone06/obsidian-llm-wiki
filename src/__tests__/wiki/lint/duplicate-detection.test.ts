import { describe, it, expect } from 'vitest';
import {
  bodyWordSet,
  computeJaccard,
  generateDuplicateCandidates,
} from '../../../wiki/lint/duplicate-detection';

// ── bodyWordSet ────────────────────────────────────────────────────────────────

describe('bodyWordSet', () => {
  it('returns unique meaningful words, filtering stopwords and short words', () => {
    const words = bodyWordSet('The wiki is a knowledge base that compiles information');
    expect(words.has('wiki')).toBe(true);
    expect(words.has('knowledge')).toBe(true);
    expect(words.has('compiles')).toBe(true);
    expect(words.has('information')).toBe(true);
    // Stopwords and short words filtered
    expect(words.has('the')).toBe(false);
    expect(words.has('is')).toBe(false);
    expect(words.has('a')).toBe(false);
    expect(words.has('that')).toBe(false);
  });

  it('produces low Jaccard for different-topic texts', () => {
    const wA = bodyWordSet(
      'A log file is a chronological append-only record detailing operational history of events. ' +
      'Entries track system events such as ingests queries maintenance passes providing audit timeline.',
    );
    const wB = bodyWordSet(
      'Query is an advanced knowledge interaction process where artificial intelligence is prompted ' +
      'to synthesize information from multiple source pages producing cohesive answers with citations.',
    );
    const sim = computeJaccard(wA, wB);
    expect(sim).toBeLessThan(0.2);
  });

  it('produces non-empty set for CJK text', () => {
    const words = bodyWordSet('深度学习是人工智能的核心技术之一 机器学习是基础');
    expect(words.size).toBeGreaterThan(0);
  });

  it('produces high Jaccard for similar CJK texts', () => {
    const shared = '深度学习是人工智能的核心技术之一 机器学习是深度学习的基础 神经网络架构';
    const wA = bodyWordSet(shared + ' 图像识别卷积网络');
    const wB = bodyWordSet(shared + ' 自然语言处理变换器');
    const sim = computeJaccard(wA, wB);
    expect(sim).toBeGreaterThanOrEqual(0.2);
  });

  it('produces low Jaccard for different-topic CJK texts', () => {
    const wA = bodyWordSet('深度学习是人工智能的核心技术 神经网络用于图像识别任务');
    const wB = bodyWordSet('历史是人类文明的记录 古代文化与现代社会的联系');
    const sim = computeJaccard(wA, wB);
    expect(sim).toBeLessThan(0.2);
  });
});

// ── generateDuplicateCandidates (shared-link regex state) ───────────────────

describe('generateDuplicateCandidates — shared link extraction', () => {
  const makePage = (path: string, body: string) => ({
    path,
    title: path.split('/').pop()!.replace(/\.md$/, ''),
    content: `---\ntype: entity\n---\n${body}\n`,
  });

  // Shared link set + high body-word overlap is required to clear
  // both the Jaccard>=0.4 link gate and the bodySim>=0.2 body gate.
  const sharedBodyA = 'Software architecture organizes modules components services and patterns across distributed systems enabling scalable deployment pipelines.';
  const sharedBodyB = 'Software architecture organizes modules components services and patterns across distributed systems enabling scalable deployment pipelines.';

  it('extracts the same shared links across multiple pages (regex state safety)', async () => {
    // Regression: a module-scoped `g`-flag regex used in a loop can leak
    // `lastIndex` from one iteration to the next. This test runs two
    // pages that share outgoing wiki-links; both pages' links MUST be
    // detected independently, even though the regex is shared.
    const pages = [
      makePage('wiki/entities/Alpha.md', `See [[wiki/entities/Hub]] and [[wiki/entities/Shared]]. ${sharedBodyA}`),
      makePage('wiki/entities/Beta.md',  `References [[wiki/entities/Hub]] and [[wiki/entities/Shared]]. ${sharedBodyB}`),
    ];

    const candidates = await generateDuplicateCandidates(pages);
    // Both pages share wiki/entities/Hub + wiki/entities/Shared, so they
    // should appear as shared-links candidates with high overlap.
    const shared = candidates.filter(c => c.signal === 'sharedLinks');
    expect(shared.length).toBeGreaterThan(0);
  });

  it('handles back-to-back pages where one page has no wiki-links', async () => {
    // Edge case: page A has zero links, pages B and C share many links.
    // The shared-link candidate generator must NOT skip page B/C's
    // links because page A's empty iteration left regex lastIndex in
    // an odd state.
    const pages = [
      makePage('wiki/entities/Empty.md', 'This page has no wiki-links at all but has some body text here.'),
      makePage('wiki/entities/Rich.md',  `Links: [[wiki/entities/Hub]] [[wiki/entities/Other]] [[wiki/entities/Third]]. ${sharedBodyA}`),
      makePage('wiki/entities/AlsoRich.md', `More links: [[wiki/entities/Hub]] [[wiki/entities/Other]] [[wiki/entities/Third]]. ${sharedBodyB}`),
    ];

    const candidates = await generateDuplicateCandidates(pages);
    const shared = candidates.filter(c => c.signal === 'sharedLinks');
    // Rich and AlsoRich share 3 links AND very similar bodies, so they
    // MUST be detected as a shared-link candidate.
    expect(shared.length).toBeGreaterThan(0);
  });
});
