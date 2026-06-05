import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestUrl } from 'obsidian';

import { AnthropicClient, AnthropicCompatibleClient, OpenAICompatibleClient } from '../llm-client';

const mockRequestUrl = vi.mocked(requestUrl);

function makeAnthropicResponse(text: string, stopReason?: string, statusCode = 200) {
  const payload = {
    content: [{ type: 'text', text }],
    stop_reason: stopReason,
  };
  return {
    status: statusCode,
    text: JSON.stringify(payload),
    json: payload,
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

function makeOpenAIResponse(text: string, finishReason?: string, statusCode = 200) {
  const payload = {
    choices: [{ message: { content: text }, finish_reason: finishReason }],
  };
  return {
    status: statusCode,
    text: JSON.stringify(payload),
    json: payload,
    headers: {},
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Awaited<ReturnType<typeof requestUrl>>;
}

describe('AnthropicCompatibleClient.createMessage', () => {
  beforeEach(() => {
    mockRequestUrl.mockClear();
  });

  it('returns text on successful non-truncated response', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello world'));
    const client = new AnthropicCompatibleClient('key', 'https://api.example.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
  });

  it('detects truncation and retries with doubled max_tokens', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello', 'max_tokens'));
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello world'));

    const client = new AnthropicCompatibleClient('key', 'https://api.example.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);

    const retryCall: { body: string } = mockRequestUrl.mock.calls[1][0] as { body: string };
    const retryBody: { max_tokens: number } = JSON.parse(retryCall.body) as { max_tokens: number };
    expect(retryBody.max_tokens).toBe(200);
  });

  it('outer retry on retryable network error (status 500)', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('status 500: server error'));
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello'));

    const client = new AnthropicCompatibleClient('key', 'https://api.example.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
  });

  it('outer retry wraps truncation: network failure during truncation triggers full retry', async () => {
    // Attempt 0: truncated, then truncation call fails with 503
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello', 'max_tokens'));
    mockRequestUrl.mockRejectedValueOnce(new Error('status 503: service unavailable'));
    // Attempt 1 (outer retry): success
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello world'));

    const client = new AnthropicCompatibleClient('key', 'https://api.example.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable errors (status 400)', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('status 400: bad request'));

    const client = new AnthropicCompatibleClient('key', 'https://api.example.com');
    await expect(client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow('status 400: bad request');

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
  });

  it('restores prefill brace if stripped by provider', async () => {
    // Simulate provider that stripped the leading '{' from prefill
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('"key": "value"}'));

    const client = new AnthropicCompatibleClient('key', 'https://api.example.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });

    expect(result).toBe('{"key": "value"}');
  });
});

describe('OpenAICompatibleClient.createMessage', () => {
  beforeEach(() => {
    mockRequestUrl.mockClear();
  });

  it('returns text on successful non-truncated response', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('Hello world'));
    const client = new OpenAICompatibleClient('key', 'https://api.openai.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
  });

  it('detects truncation (finish_reason=length) and retries with doubled max_tokens', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('Hello', 'length'));
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('Hello world'));

    const client = new OpenAICompatibleClient('key', 'https://api.openai.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);

    const retryCall: { body: string } = mockRequestUrl.mock.calls[1][0] as { body: string };
    const retryBody: { max_tokens: number } = JSON.parse(retryCall.body) as { max_tokens: number };
    expect(retryBody.max_tokens).toBe(200);
  });

  it('outer retry on retryable network error', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('status 429: rate limited'));
    mockRequestUrl.mockResolvedValueOnce(makeOpenAIResponse('Hello'));

    const client = new OpenAICompatibleClient('key', 'https://api.openai.com');
    const result = await client.createMessage({
      model: 'test-model',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
  });
});

describe('AnthropicClient.createMessage', () => {
  beforeEach(() => {
    mockRequestUrl.mockClear();
  });

  it('returns text on successful non-truncated response', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Hello world', 'end_turn'));

    const client = new AnthropicClient('test-key');
    const result = await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
  });

  it('detects truncation (stop_reason=max_tokens) and retries with doubled max_tokens', async () => {
    mockRequestUrl
      .mockResolvedValueOnce(makeAnthropicResponse('Hello', 'max_tokens'))
      .mockResolvedValueOnce(makeAnthropicResponse('Hello world', 'end_turn'));

    const client = new AnthropicClient('test-key');
    const result = await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello world');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);

    const retryCall = mockRequestUrl.mock.calls[1][0] as { body: string };
    const retryBody = JSON.parse(retryCall.body) as { max_tokens: number };
    expect(retryBody.max_tokens).toBe(200);
  });

  it('does not retry when stop_reason is not max_tokens (e.g. end_turn, stop_sequence)', async () => {
    mockRequestUrl.mockResolvedValueOnce(makeAnthropicResponse('Complete answer', 'end_turn'));

    const client = new AnthropicClient('test-key');
    const result = await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Complete answer');
    expect(mockRequestUrl).toHaveBeenCalledTimes(1); // no retry
  });

  it('outer retry on retryable network error (status 500)', async () => {
    mockRequestUrl
      .mockRejectedValueOnce(new Error('status 500: server error'))
      .mockResolvedValueOnce(makeAnthropicResponse('Hello', 'end_turn'));

    const client = new AnthropicClient('test-key');
    const result = await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('Hello');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable error (status 400)', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('status 400: bad request'));

    const client = new AnthropicClient('test-key');
    await expect(client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow('status 400: bad request');

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
  });

  it('restores prefill brace if stripped by provider in truncation retry path', async () => {
    mockRequestUrl
      .mockResolvedValueOnce(makeAnthropicResponse('"key": "value"}', 'max_tokens'))
      .mockResolvedValueOnce(makeAnthropicResponse('"key": "value"}', 'end_turn'));

    const client = new AnthropicClient('test-key');
    const result = await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });

    expect(result).toBe('{"key": "value"}');
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
  });

  it('caps retry max_tokens at MAX_TOKENS_BATCH (16000) when doubled exceeds it', async () => {
    mockRequestUrl
      .mockResolvedValueOnce(makeAnthropicResponse('truncated', 'max_tokens'))
      .mockResolvedValueOnce(makeAnthropicResponse('full response', 'end_turn'));

    const client = new AnthropicClient('test-key');
    await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 15000, // doubled = 30000, but should cap at 16000
      messages: [{ role: 'user', content: 'hi' }],
    });

    const retryCall = mockRequestUrl.mock.calls[1][0] as { body: string };
    const retryBody = JSON.parse(retryCall.body) as { max_tokens: number };
    expect(retryBody.max_tokens).toBe(16000);
  });

  it('passes through response_format prefill brace correctly when not truncated', async () => {
    mockRequestUrl.mockResolvedValueOnce(
      makeAnthropicResponse('"key": "value"}', 'end_turn')
    );

    const client = new AnthropicClient('test-key');
    const result = await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });

    expect(result).toBe('{"key": "value"}');
  });

  it('passes cacheBreakpoint through to request body', async () => {
    mockRequestUrl.mockResolvedValueOnce(
      makeAnthropicResponse('cached response', 'end_turn')
    );

    const client = new AnthropicClient('test-key');
    await client.createMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'long prompt that should be split for caching' }
      ],
      cacheBreakpoint: 10,
    });

    const callArgs = mockRequestUrl.mock.calls[0]?.[0] as { body: string };
    const body = JSON.parse(callArgs.body) as { messages: Array<{ content: unknown; role: string }> };
    expect(body.messages).toHaveLength(1);
    const firstMsg = body.messages[0];
    expect(Array.isArray(firstMsg.content)).toBe(true);
    expect((firstMsg.content as Array<unknown>)[0]).toHaveProperty('cache_control');
  });
});
