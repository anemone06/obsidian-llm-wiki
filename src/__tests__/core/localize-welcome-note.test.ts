import { describe, it, expect, vi } from 'vitest';
import { localizeWelcomeNote, type LocalizeArgs } from '../../core/localize-welcome-note';

const CHINESE_BODY = `---
title: Wiki 创始笔记
type: welcome
created: 2026-06-27
---

# 欢迎使用你的维基

介绍段落。
`;

const ENGLISH_TRANSLATED = `---
title: Wiki Founding Note
type: welcome
created: 2026-06-27
---

# Welcome to your Wiki

Intro paragraph.
`;

function makeArgs(overrides: Partial<LocalizeArgs> = {}): LocalizeArgs {
  return {
    englishBody: CHINESE_BODY,
    targetLanguage: 'en',
    llmClient: overrides.llmClient ?? {
      createMessage: vi.fn().mockResolvedValue(
        JSON.stringify({ translated: ENGLISH_TRANSLATED }),
      ),
    },
    model: 'claude-opus-4-8',
    ...overrides,
  };
}

describe('localizeWelcomeNote — happy path', () => {
  it('returns the LLM-translated body when targetLanguage is not Chinese', async () => {
    const result = await localizeWelcomeNote(makeArgs());

    expect(result.ok).toBe(true);
    expect(result.body).toBe(ENGLISH_TRANSLATED);
    expect(result.localized).toBe(true);
  });

  it('parses JSON-wrapped LLM response', async () => {
    const result = await localizeWelcomeNote(makeArgs({
      llmClient: {
        createMessage: vi.fn().mockResolvedValue(
          JSON.stringify({ translated: ENGLISH_TRANSLATED }),
        ),
      },
    }));
    expect(result.body).toBe(ENGLISH_TRANSLATED);
  });

  it('passes target language in the system prompt to guide translation', async () => {
    const createMessage = vi.fn().mockResolvedValue(
      JSON.stringify({ translated: ENGLISH_TRANSLATED }),
    );
    await localizeWelcomeNote(makeArgs({ llmClient: { createMessage }, targetLanguage: 'ja' }));

    const call = createMessage.mock.calls[0][0] as { system: string; messages: Array<{ content: string }> };
    expect(call.system).toMatch(/Japanese|Japanese language/i);
    expect(call.messages[0].content).toContain(CHINESE_BODY);
  });

  it('sends a single user message with the Chinese body to translate', async () => {
    const createMessage = vi.fn().mockResolvedValue(
      JSON.stringify({ translated: ENGLISH_TRANSLATED }),
    );
    await localizeWelcomeNote(makeArgs({ llmClient: { createMessage } }));

    const call = createMessage.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      model: string;
    };
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toBe(CHINESE_BODY);
    expect(call.max_tokens).toBeGreaterThan(0);
    expect(call.model).toBe('claude-opus-4-8');
  });
});

describe('localizeWelcomeNote — short-circuit', () => {
  it('returns Chinese body without calling LLM when targetLanguage is zh', async () => {
    const createMessage = vi.fn();
    const result = await localizeWelcomeNote(
      makeArgs({ llmClient: { createMessage }, targetLanguage: 'zh' }),
    );

    expect(result.ok).toBe(true);
    expect(result.body).toBe(CHINESE_BODY);
    expect(result.localized).toBe(false);
    expect(createMessage).not.toHaveBeenCalled();
  });
});

describe('localizeWelcomeNote — fallback on LLM failure', () => {
  it('returns Chinese body when LLM throws an error', async () => {
    const result = await localizeWelcomeNote(
      makeArgs({
        llmClient: {
          createMessage: vi.fn().mockRejectedValue(new Error('rate limit')),
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.localized).toBe(false);
    expect(result.body).toBe(CHINESE_BODY);
    expect(result.error).toMatch(/rate limit/);
  });

  it('returns Chinese body when LLM returns invalid JSON', async () => {
    const result = await localizeWelcomeNote(
      makeArgs({
        llmClient: {
          createMessage: vi.fn().mockResolvedValue('not json at all'),
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.localized).toBe(false);
    expect(result.body).toBe(CHINESE_BODY);
    expect(result.error).toBeDefined();
  });

  it('returns Chinese body when JSON is valid but missing translated field', async () => {
    const result = await localizeWelcomeNote(
      makeArgs({
        llmClient: {
          createMessage: vi.fn().mockResolvedValue(JSON.stringify({ other: 'value' })),
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.body).toBe(CHINESE_BODY);
  });

  it('preserves Chinese body verbatim in fallback', async () => {
    const result = await localizeWelcomeNote(
      makeArgs({
        llmClient: {
          createMessage: vi.fn().mockRejectedValue(new Error('boom')),
        },
      }),
    );

    expect(result.body).toBe(CHINESE_BODY);
    expect(result.body).not.toMatch(/ERROR|FAIL|⚠️/);
  });
});

describe('localizeWelcomeNote — JSON repair', () => {
  it('extracts JSON when LLM wraps it with prose before and after', async () => {
    const result = await localizeWelcomeNote(
      makeArgs({
        llmClient: {
          createMessage: vi.fn().mockResolvedValue(
            `Sure, here is the translation:\n${JSON.stringify({ translated: ENGLISH_TRANSLATED })}\nDone.`,
          ),
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.body).toBe(ENGLISH_TRANSLATED);
  });
});
