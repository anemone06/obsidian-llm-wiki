// token-key-probe.test.ts
//
// TDD for the simplified runtime probe-then-cache mechanism:
// no error-body parsing, no regex matching.
// Just "status 400 → try the other key once".

import { describe, it, expect, beforeEach } from 'vitest';
import { TokenKeyProber } from '../token-key-probe';

describe('TokenKeyProber', () => {
  let prober: TokenKeyProber;

  beforeEach(() => {
    prober = new TokenKeyProber();
  });

  describe('altKey()', () => {
    it('returns max_completion_tokens for max_tokens', () => {
      expect(prober.altKey('max_tokens')).toBe('max_completion_tokens');
    });

    it('returns max_tokens for max_completion_tokens', () => {
      expect(prober.altKey('max_completion_tokens')).toBe('max_tokens');
    });
  });

  describe('getCachedKey() / setCachedKey()', () => {
    it('returns undefined for unseen baseURL', () => {
      expect(prober.getCachedKey('https://api.example.com/v1')).toBeUndefined();
    });

    it('stores and retrieves cached key', () => {
      prober.setCachedKey('https://api.example.com/v1', 'max_completion_tokens');
      expect(prober.getCachedKey('https://api.example.com/v1')).toBe('max_completion_tokens');
    });

    it('treats different baseURLs independently', () => {
      prober.setCachedKey('https://api.openai.com/v1', 'max_completion_tokens');
      prober.setCachedKey('https://api.example.com/v1', 'max_tokens');
      expect(prober.getCachedKey('https://api.openai.com/v1')).toBe('max_completion_tokens');
      expect(prober.getCachedKey('https://api.example.com/v1')).toBe('max_tokens');
    });
  });

  describe('invalidate()', () => {
    it('removes entry for a specific baseURL', () => {
      prober.setCachedKey('https://api.example.com/v1', 'max_completion_tokens');
      prober.invalidate('https://api.example.com/v1');
      expect(prober.getCachedKey('https://api.example.com/v1')).toBeUndefined();
    });

    it('clears all entries when called without arg', () => {
      prober.setCachedKey('https://api.openai.com/v1', 'max_completion_tokens');
      prober.setCachedKey('https://api.example.com/v1', 'max_tokens');
      prober.invalidate();
      expect(prober.getCachedKey('https://api.openai.com/v1')).toBeUndefined();
      expect(prober.getCachedKey('https://api.example.com/v1')).toBeUndefined();
    });

    it('does not affect other baseURLs after specific invalidation', () => {
      prober.setCachedKey('https://api.openai.com/v1', 'max_completion_tokens');
      prober.setCachedKey('https://api.example.com/v1', 'max_tokens');
      prober.invalidate('https://api.openai.com/v1');
      expect(prober.getCachedKey('https://api.example.com/v1')).toBe('max_tokens');
    });
  });
});
