import { describe, expect, it } from 'vitest';
import { getPromptByVersion } from '@fastgpt/global/core/ai/prompt/utils';

describe('getPromptByVersion', () => {
  const samplePromptMap = {
    '1.0.0': 'prompt v1.0.0',
    '1.1.0': 'prompt v1.1.0',
    '2.0.0': 'prompt v2.0.0',
    '1.0.1': 'prompt v1.0.1'
  };

  describe('version sorting', () => {
    it('should return highest version when no version specified', () => {
      expect(getPromptByVersion(undefined, samplePromptMap)).toBe('prompt v2.0.0');
    });

    it('should sort by major version first', () => {
      const map = {
        '1.9.9': 'v1',
        '2.0.0': 'v2',
        '3.0.0': 'v3'
      };
      expect(getPromptByVersion(undefined, map)).toBe('v3');
    });

    it('should sort by minor version when major is same', () => {
      const map = {
        '1.0.0': 'v1.0',
        '1.2.0': 'v1.2',
        '1.1.0': 'v1.1'
      };
      expect(getPromptByVersion(undefined, map)).toBe('v1.2');
    });

    it('should sort by patch version when major and minor are same', () => {
      const map = {
        '1.0.0': 'v1.0.0',
        '1.0.2': 'v1.0.2',
        '1.0.1': 'v1.0.1'
      };
      expect(getPromptByVersion(undefined, map)).toBe('v1.0.2');
    });
  });

  describe('version matching', () => {
    it('should return exact version match when version exists', () => {
      expect(getPromptByVersion('1.0.0', samplePromptMap)).toBe('prompt v1.0.0');
      expect(getPromptByVersion('1.1.0', samplePromptMap)).toBe('prompt v1.1.0');
      expect(getPromptByVersion('2.0.0', samplePromptMap)).toBe('prompt v2.0.0');
    });

    it('should return highest version when specified version not found', () => {
      expect(getPromptByVersion('3.0.0', samplePromptMap)).toBe('prompt v2.0.0');
      expect(getPromptByVersion('0.0.1', samplePromptMap)).toBe('prompt v2.0.0');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for empty promptMap', () => {
      expect(getPromptByVersion(undefined, {})).toBeUndefined();
      expect(getPromptByVersion('1.0.0', {})).toBeUndefined();
    });

    it('should use default empty object when promptMap not provided', () => {
      expect(getPromptByVersion(undefined)).toBeUndefined();
      expect(getPromptByVersion('1.0.0')).toBeUndefined();
    });

    it('should handle single version in map', () => {
      const map = { '1.0.0': 'only version' };
      expect(getPromptByVersion(undefined, map)).toBe('only version');
      expect(getPromptByVersion('1.0.0', map)).toBe('only version');
      expect(getPromptByVersion('2.0.0', map)).toBe('only version');
    });

    it('should handle empty string version', () => {
      expect(getPromptByVersion('', samplePromptMap)).toBe('prompt v2.0.0');
    });
  });
});
