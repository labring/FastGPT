import { describe, it, expect } from 'vitest';
import {
  mdTextFormat,
  CodeClassNameEnum,
  hideStreamingIncompleteMarkdownTail
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
      expect(CodeClassNameEnum.quickReplies).toBe('quick-replies');
    });
  });

  describe('hideStreamingIncompleteMarkdownTail', () => {
    it('should hide incomplete image markdown at the streaming tail', () => {
      expect(hideStreamingIncompleteMarkdownTail('before ![](https://example.com/a.png')).toBe(
        'before '
      );
      expect(hideStreamingIncompleteMarkdownTail('before ![alt](https://example.com/a.png')).toBe(
        'before '
      );
    });

    it('should hide incomplete image alt syntax at the streaming tail', () => {
      expect(hideStreamingIncompleteMarkdownTail('before ![alt')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before ![alt]')).toBe('before ');
    });

    it('should keep complete image markdown unchanged', () => {
      const text = 'before ![alt](https://example.com/a.png)';

      expect(hideStreamingIncompleteMarkdownTail(text)).toBe(text);
    });

    it('should reveal broken image syntax after the tail is interrupted', () => {
      const text = 'before ![alt](https://example.com/a.png and text';

      expect(hideStreamingIncompleteMarkdownTail(text)).toBe(text);
    });

    it('should reveal incomplete image syntax when the hidden tail is too long', () => {
      const hiddenTailWithinLimit = `![alt](${''.padEnd(93, 'a')}`;
      const hiddenTailOverLimit = `![alt](${''.padEnd(94, 'a')}`;

      expect(hiddenTailWithinLimit.length).toBe(100);
      expect(hiddenTailOverLimit.length).toBe(101);
      expect(hideStreamingIncompleteMarkdownTail(`before ${hiddenTailWithinLimit}`)).toBe(
        'before '
      );
      expect(hideStreamingIncompleteMarkdownTail(`before ${hiddenTailOverLimit}`)).toBe(
        `before ${hiddenTailOverLimit}`
      );
    });

    it('should hide incomplete link markdown at the streaming tail', () => {
      expect(hideStreamingIncompleteMarkdownTail('before [doc](https://example.com/page')).toBe(
        'before '
      );
    });

    it('should keep incomplete plain link text visible', () => {
      const text = 'before [doc';

      expect(hideStreamingIncompleteMarkdownTail(text)).toBe(text);
    });

    it('should hide incomplete cite markdown at the streaming tail', () => {
      expect(hideStreamingIncompleteMarkdownTail('before [507f1f77bcf86cd799439011](CITE')).toBe(
        'before '
      );
      expect(hideStreamingIncompleteMarkdownTail('before [507f1f77bcf86cd799439011](QUOTE')).toBe(
        'before '
      );
      expect(hideStreamingIncompleteMarkdownTail('before [507f1f77bcf86cd799439011]')).toBe(
        'before '
      );
      expect(hideStreamingIncompleteMarkdownTail('before [507f1f77bcf86cd79943901')).toBe(
        'before '
      );
    });

    it('should keep complete cite markdown unchanged', () => {
      const cite = 'before [507f1f77bcf86cd799439011](CITE)';
      const quote = 'before [507f1f77bcf86cd799439011](QUOTE)';

      expect(hideStreamingIncompleteMarkdownTail(cite)).toBe(cite);
      expect(hideStreamingIncompleteMarkdownTail(quote)).toBe(quote);
    });

    it('should hide incomplete text style markdown at the streaming tail', () => {
      expect(hideStreamingIncompleteMarkdownTail('before **bold')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before __bold')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before *italic')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before _italic')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before ~~deleted')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before `code')).toBe('before ');
    });

    it('should keep complete text style markdown unchanged', () => {
      const text =
        'before **bold** and __strong__ and *italic* and _em_ and ~~deleted~~ and `code`';

      expect(hideStreamingIncompleteMarkdownTail(text)).toBe(text);
    });

    it('should reveal incomplete text style markdown when the hidden content is too long', () => {
      const hiddenTailWithinLimit = `**${''.padEnd(48, 'a')}`;
      const hiddenTailOverLimit = `**${''.padEnd(49, 'a')}`;

      expect(hiddenTailWithinLimit.length).toBe(50);
      expect(hiddenTailOverLimit.length).toBe(51);
      expect(hideStreamingIncompleteMarkdownTail(`before ${hiddenTailWithinLimit}`)).toBe(
        'before '
      );
      expect(hideStreamingIncompleteMarkdownTail(`before ${hiddenTailOverLimit}`)).toBe(
        `before ${hiddenTailOverLimit}`
      );
    });

    it('should not hide text style markdown that is probably interrupted or plain text', () => {
      const interrupted = 'before ** bold';
      const plainText = 'foo**bar';
      const listItem = '* item';
      const multiplication = 'x*y';
      const snakeCase = 'foo_bar';

      expect(hideStreamingIncompleteMarkdownTail(interrupted)).toBe(interrupted);
      expect(hideStreamingIncompleteMarkdownTail(plainText)).toBe(plainText);
      expect(hideStreamingIncompleteMarkdownTail(listItem)).toBe(listItem);
      expect(hideStreamingIncompleteMarkdownTail(multiplication)).toBe(multiplication);
      expect(hideStreamingIncompleteMarkdownTail(snakeCase)).toBe(snakeCase);
    });

    it('should not hide incomplete markdown inside code spans or fences', () => {
      const inlineCode = '`![alt](https://example.com/a.png`';
      const fencedCode = '```md\n![alt](https://example.com/a.png';

      expect(hideStreamingIncompleteMarkdownTail(inlineCode)).toBe(inlineCode);
      expect(hideStreamingIncompleteMarkdownTail(fencedCode)).toBe(fencedCode);
    });
  });
});
