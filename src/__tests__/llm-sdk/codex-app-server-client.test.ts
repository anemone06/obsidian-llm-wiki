import { describe, expect, it } from 'vitest';
import { buildCodexPrompt } from '../../llm-sdk/codex-app-server-client';

describe('buildCodexPrompt', () => {
  it('preserves system and conversation roles', () => {
    const prompt = buildCodexPrompt({
      system: 'Use the wiki context.',
      messages: [
        { role: 'user', content: 'Who is Ada?' },
        { role: 'assistant', content: 'Ada is a person.' },
      ],
    });

    expect(prompt).toContain('<system>\nUse the wiki context.\n</system>');
    expect(prompt).toContain('<user>\nWho is Ada?\n</user>');
    expect(prompt).toContain('<assistant>\nAda is a person.\n</assistant>');
  });

  it('adds a JSON-only instruction for structured calls', () => {
    const prompt = buildCodexPrompt({
      messages: [{ role: 'user', content: 'Extract entities.' }],
      response_format: { type: 'json_object' },
    });

    expect(prompt).toContain('Return only one valid JSON object');
    expect(prompt).not.toContain('```');
  });
});
