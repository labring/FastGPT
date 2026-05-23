import { describe, expect, it } from 'vitest';
import { formatImageSpec, parseImageSpec } from '@/utils/image';

describe('image utilities', () => {
  describe('formatImageSpec', () => {
    it('formats repository, tag, and digest combinations', () => {
      expect(formatImageSpec({ repository: 'nginx', tag: 'latest' })).toBe('nginx:latest');
      expect(formatImageSpec({ repository: 'nginx', digest: 'sha256:abc123' })).toBe(
        'nginx@sha256:abc123'
      );
      expect(formatImageSpec({ repository: 'nginx', tag: '1.0', digest: 'sha256:abc123' })).toBe(
        'nginx:1.0@sha256:abc123'
      );
      expect(formatImageSpec({ repository: 'nginx' })).toBe('nginx');
    });
  });

  describe('parseImageSpec', () => {
    it('parses repository, tag, and digest combinations', () => {
      expect(parseImageSpec('nginx:latest')).toEqual({ repository: 'nginx', tag: 'latest' });
      expect(parseImageSpec('nginx@sha256:abc123')).toEqual({
        repository: 'nginx',
        digest: 'sha256:abc123'
      });
      expect(parseImageSpec('registry.local:5000/ns/app:1.0')).toEqual({
        repository: 'registry.local:5000/ns/app',
        tag: '1.0'
      });
      expect(parseImageSpec('registry.local:5000/ns/app')).toEqual({
        repository: 'registry.local:5000/ns/app'
      });
      expect(parseImageSpec('nginx')).toEqual({ repository: 'nginx' });
    });

    it('returns an empty repository for missing image strings', () => {
      expect(parseImageSpec()).toEqual({ repository: '' });
      expect(parseImageSpec('')).toEqual({ repository: '' });
    });
  });
});
