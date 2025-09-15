import { describe, it, expect } from 'vitest';
import { mdTextFormat, CodeClassNameEnum } from '@/components/Markdown/utils';

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
});
