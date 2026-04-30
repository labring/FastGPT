import { describe, expect, it } from 'vitest';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';

describe('removeDatasetCiteText', () => {
  describe('when retainDatasetCite is true', () => {
    it('should only remove [id](CITE) pattern', () => {
      const text = 'Hello [id](CITE) world';
      expect(removeDatasetCiteText(text, true)).toBe('Hello  world');
    });

    it('should only remove 【id】(CITE) pattern', () => {
      const text = 'Hello 【id】(CITE) world';
      expect(removeDatasetCiteText(text, true)).toBe('Hello  world');
    });

    it('should keep 24-char hex id patterns when retainDatasetCite is true', () => {
      const text = 'Reference [507f1f77bcf86cd799439011] here';
      expect(removeDatasetCiteText(text, true)).toBe('Reference [507f1f77bcf86cd799439011] here');
    });

    it('should keep 24-char hex id with parentheses when retainDatasetCite is true', () => {
      const text = 'Reference [507f1f77bcf86cd799439011](link) here';
      expect(removeDatasetCiteText(text, true)).toBe(
        'Reference [507f1f77bcf86cd799439011](link) here'
      );
    });

    it('should remove multiple [id](CITE) patterns', () => {
      const text = '[id](CITE) start [id](CITE) middle 【id】(CITE) end';
      expect(removeDatasetCiteText(text, true)).toBe(' start  middle  end');
    });
  });

  describe('when retainDatasetCite is false', () => {
    it('should remove [id](CITE) pattern', () => {
      const text = 'Hello [id](CITE) world';
      expect(removeDatasetCiteText(text, false)).toBe('Hello  world');
    });

    it('should remove 24-char hex id in square brackets', () => {
      const text = 'Reference [507f1f77bcf86cd799439011] here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove 24-char hex id in Chinese brackets', () => {
      const text = 'Reference 【507f1f77bcf86cd799439011】 here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove 24-char hex id with parentheses content', () => {
      const text = 'Reference [507f1f77bcf86cd799439011](some link) here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove 24-char hex id with Chinese brackets and parentheses', () => {
      const text = 'Reference 【507f1f77bcf86cd799439011】(some link) here';
      expect(removeDatasetCiteText(text, false)).toBe('Reference  here');
    });

    it('should remove multiple citation patterns', () => {
      const text = '[507f1f77bcf86cd799439011] and [607f1f77bcf86cd799439012](link) and [id](CITE)';
      expect(removeDatasetCiteText(text, false)).toBe(' and  and ');
    });

    it('should handle mixed bracket styles', () => {
      const text = '[507f1f77bcf86cd799439011] and 【607f1f77bcf86cd799439012】';
      expect(removeDatasetCiteText(text, false)).toBe(' and ');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(removeDatasetCiteText('', true)).toBe('');
      expect(removeDatasetCiteText('', false)).toBe('');
    });

    it('should return original text when no patterns match', () => {
      const text = 'Hello world without citations';
      expect(removeDatasetCiteText(text, true)).toBe(text);
      expect(removeDatasetCiteText(text, false)).toBe(text);
    });

    it('should not remove non-24-char hex ids', () => {
      const text = '[abc123] and [507f1f77bcf86cd79943901] short';
      expect(removeDatasetCiteText(text, false)).toBe(
        '[abc123] and [507f1f77bcf86cd79943901] short'
      );
    });

    it('should not remove ids with non-hex characters', () => {
      const text = '[507f1f77bcf86cd79943901g] invalid';
      expect(removeDatasetCiteText(text, false)).toBe('[507f1f77bcf86cd79943901g] invalid');
    });
  });
});
