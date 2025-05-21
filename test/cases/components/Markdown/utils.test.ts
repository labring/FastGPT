import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mdTextFormat,
  CodeClassNameEnum,
  checkIsUrlSafe,
  getSafeUrl
} from '@/components/Markdown/utils';

describe('Markdown utils', () => {
  describe('mdTextFormat', () => {
    it('should format latex expressions correctly', () => {
      const input = 'Here is some math: \\[x^2 + y^2 = z^2\\] and inline \\(a+b=c\\)';
      const expected = 'Here is some math: $$x^2 + y^2 = z^2$$ and inline $a+b=c$';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should not format latex expressions inside code blocks', () => {
      const input = '```math\n\\[x^2\\]\n```\n`\\[y^2\\]`';
      expect(mdTextFormat(input)).toBe(input);
    });

    it('should convert quote references to proper markdown links', () => {
      const input = '[123456789012345678901234]';
      const expected = '[123456789012345678901234](CITE)';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should not convert invalid quote references', () => {
      const input = '[12345] [abcdef] [123456789012345678901234](test)';
      expect(mdTextFormat(input)).toBe(input);
    });

    it('should add spaces between URLs and Chinese punctuation', () => {
      const input = 'Check https://example.com，here。';
      const expected = 'Check https://example.com ，here。';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should handle complex text with multiple patterns', () => {
      const input =
        'Math \\[x^2\\] with link https://test.com，and quote [123456789012345678901234]';
      const expected =
        'Math $$x^2$$ with link https://test.com ，and quote [123456789012345678901234](CITE)';
      expect(mdTextFormat(input)).toBe(expected);
    });
  });

  describe('CodeClassNameEnum', () => {
    it('should have correct enum values', () => {
      expect(CodeClassNameEnum.guide).toBe('guide');
      expect(CodeClassNameEnum.questionguide).toBe('questionguide');
      expect(CodeClassNameEnum.mermaid).toBe('mermaid');
      expect(CodeClassNameEnum.echarts).toBe('echarts');
      expect(CodeClassNameEnum.quote).toBe('quote');
      expect(CodeClassNameEnum.files).toBe('files');
      expect(CodeClassNameEnum.latex).toBe('latex');
      expect(CodeClassNameEnum.iframe).toBe('iframe');
      expect(CodeClassNameEnum.html).toBe('html');
      expect(CodeClassNameEnum.svg).toBe('svg');
      expect(CodeClassNameEnum.video).toBe('video');
      expect(CodeClassNameEnum.audio).toBe('audio');
    });
  });

  describe('checkIsUrlSafe', () => {
    const originalWindow = global.window;

    beforeEach(() => {
      global.window = {
        location: {
          origin: 'http://localhost:3000'
        }
      } as any;
    });

    afterEach(() => {
      global.window = originalWindow;
    });

    it('should return false for empty URL', () => {
      expect(checkIsUrlSafe('')).toBe(false);
    });

    it('should return false for javascript: protocol', () => {
      expect(checkIsUrlSafe('javascript:alert(1)')).toBe(false);
      expect(checkIsUrlSafe('JAVASCRIPT:alert(1)')).toBe(false);
    });

    it('should return false for same origin URLs', () => {
      expect(checkIsUrlSafe('http://localhost:3000/test')).toBe(false);
    });

    it('should return true for valid external URLs', () => {
      expect(checkIsUrlSafe('https://example.com')).toBe(true);
      expect(checkIsUrlSafe('http://external-site.com/path')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(checkIsUrlSafe('not-a-url')).toBe(false);
      expect(checkIsUrlSafe('http://')).toBe(false);
    });
  });

  describe('getSafeUrl', () => {
    const originalWindow = global.window;

    beforeEach(() => {
      global.window = {
        location: {
          origin: 'http://localhost:3000'
        }
      } as any;
    });

    afterEach(() => {
      global.window = originalWindow;
    });

    it('should return original URL for safe URLs', () => {
      const safeUrl = 'https://example.com';
      expect(getSafeUrl(safeUrl)).toBe(safeUrl);
    });

    it('should return # for unsafe URLs', () => {
      expect(getSafeUrl('javascript:alert(1)')).toBe('#');
      expect(getSafeUrl('')).toBe('#');
      expect(getSafeUrl('not-a-url')).toBe('#');
      expect(getSafeUrl('http://localhost:3000/test')).toBe('#');
    });
  });
});
