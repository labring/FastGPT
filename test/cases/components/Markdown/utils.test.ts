import { describe, it, expect } from 'vitest';
import { mdTextFormat, CodeClassNameEnum, filterSafeProps } from '@/components/Markdown/utils';

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

  describe('filterSafeProps', () => {
    const allowedAttrs = new Set(['class', 'style', 'title', 'id']);

    it('should filter out non-whitelisted attributes', () => {
      const props = {
        class: 'test',
        nonexistent: 'value',
        title: 'title'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'test',
        title: 'title'
      });
    });

    it('should filter out dangerous event handlers', () => {
      const props = {
        class: 'test',
        onClick: () => {},
        onMouseover: () => {}
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'test'
      });
    });

    it('should filter out dangerous protocols', () => {
      const props = {
        title: 'javascript:alert(1)',
        id: 'vbscript:alert(1)',
        class: 'safe'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'safe'
      });
    });

    it('should handle encoded malicious content', () => {
      const props = {
        title: '&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)',
        id: '%6A%61%76%61%73%63%72%69%70%74%3Aalert(1)',
        class: 'safe'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'safe'
      });
    });

    it('should filter style objects', () => {
      const props = {
        style: {
          color: 'red',
          background: 'javascript:alert(1)'
        },
        class: 'test'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'test'
      });
    });

    it('should handle empty and null values', () => {
      const props = {
        class: '',
        title: null,
        style: null
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: '',
        title: null,
        style: null
      });
    });

    it('should filter nested objects except style', () => {
      const props = {
        data: { key: 'value' },
        style: { color: 'red' },
        class: 'test'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        style: { color: 'red' },
        class: 'test'
      });
    });

    it('should handle multiple iterations of encoded content', () => {
      const props = {
        title: encodeURIComponent(encodeURIComponent('javascript:alert(1)')),
        class: 'safe'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'safe'
      });
    });

    it('should filter suspicious content patterns', () => {
      const props = {
        title: 'Function("alert(1)")',
        id: 'eval("alert(1)")',
        class: 'test'
      };
      const result = filterSafeProps(props, allowedAttrs);
      expect(result).toEqual({
        class: 'test'
      });
    });
  });
});
