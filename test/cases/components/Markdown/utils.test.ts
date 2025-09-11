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

    it('should add space between url and quote reference', () => {
      const input =
        'http://localhost:3000[123456789012345678901234](CITE) and https://abc.com[abcdefabcdefabcdefabcdef](CITE)';
      const expected =
        'http://localhost:3000 [123456789012345678901234](CITE) and https://abc.com [abcdefabcdefabcdefabcdef](CITE)';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should not add space for url without quote reference', () => {
      const input = 'http://localhost:3000 and https://abc.com';
      expect(mdTextFormat(input)).toBe(input);
    });

    it('should handle multiple latex and code blocks', () => {
      const input = 'Equation: \\[x=1\\].\n```js\n\\[y=2\\]\n```\nInline: \\(z=3\\)';
      const expected = 'Equation: $$x=1$$.\n```js\n\\[y=2\\]\n```\nInline: $z=3$';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should handle quote after url with Chinese punctuation', () => {
      const input = 'url: https://abc.com，[abcdefabcdefabcdefabcdef] more text';
      const expected = 'url: https://abc.com ，[abcdefabcdefabcdefabcdef](CITE) more text';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should not change code block containing latex and quote', () => {
      const input =
        '```latex\n\\[x=1\\]\n[123456789012345678901234]\n```\nNormal text \\[y=2\\] [abcdefabcdefabcdefabcdef]';
      const expected =
        '```latex\n\\[x=1\\]\n[123456789012345678901234](CITE)\n```\nNormal text $$y=2$$ [abcdefabcdefabcdefabcdef](CITE)';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(mdTextFormat('')).toBe('');
    });

    it('should handle string with only code block', () => {
      const input = '```js\nconsole.log("Hello")\n```';
      expect(mdTextFormat(input)).toBe(input);
    });

    it('should handle string with only inline code', () => {
      const input = '`inline code`';
      expect(mdTextFormat(input)).toBe(input);
    });

    // Additional edge cases for coverage
    it('should not modify text if no patterns matched', () => {
      const input = 'Just text without any patterns.';
      expect(mdTextFormat(input)).toBe(input);
    });

    it('should handle multiple adjacent quote references', () => {
      const input = '[abcdefabcdefabcdefabcdef][abcdefabcdefabcdefabcdef]';
      const expected = '[abcdefabcdefabcdefabcdef](CITE)[abcdefabcdefabcdefabcdef](CITE)';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should handle url followed by quote and Chinese punctuation', () => {
      const input = 'https://abc.com[abcdefabcdefabcdefabcdef](CITE)，end';
      const expected = 'https://abc.com [abcdefabcdefabcdefabcdef](CITE)，end';
      expect(mdTextFormat(input)).toBe(expected);
    });

    it('should format latex if surrounded by spaces', () => {
      const input = 'before \\[x+1\\] after';
      const expected = 'before $$x+1$$ after';
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

    it('should have new enum values', () => {
      expect(CodeClassNameEnum.table).toBe('table');
      expect(CodeClassNameEnum.indicator).toBe('indicator');
      expect(CodeClassNameEnum.link).toBe('link');
      expect(CodeClassNameEnum.error_tips).toBe('error_tips');
      expect(CodeClassNameEnum.warning_tips).toBe('warning_tips');
      expect(CodeClassNameEnum.divider).toBe('divider');
      expect(CodeClassNameEnum.textblock).toBe('textblock');
    });
  });
});
