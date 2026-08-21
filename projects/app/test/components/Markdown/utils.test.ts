import { describe, it, expect } from 'vitest';
import {
  mdTextFormat,
  CodeClassNameEnum,
  hideStreamingIncompleteMarkdownTail,
  prepareStreamingMarkdown
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

    it('should delay a potential link label until its structure is known', () => {
      expect(hideStreamingIncompleteMarkdownTail('before [doc')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before [doc]')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before [doc] and text')).toBe(
        'before [doc] and text'
      );
    });

    it('should delay an incomplete angle-bracket link', () => {
      expect(hideStreamingIncompleteMarkdownTail('before <https://example.com')).toBe('before ');
      expect(hideStreamingIncompleteMarkdownTail('before <https://example.com>')).toBe(
        'before <https://example.com>'
      );
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

    it('should keep incomplete text formatting when only media tails need hiding', () => {
      expect(
        hideStreamingIncompleteMarkdownTail('before **bold', { hideTextFormatting: false })
      ).toBe('before **bold');
      expect(
        hideStreamingIncompleteMarkdownTail('before ![alt](https://example.com/a.png', {
          hideTextFormatting: false
        })
      ).toBe('before ');
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

  describe('prepareStreamingMarkdown', () => {
    it('should keep list and bold inputs stable before and after the closing marker arrives', () => {
      expect(prepareStreamingMarkdown('- **粗')).toBe('- **粗**');
      expect(prepareStreamingMarkdown('- **粗体')).toBe('- **粗体**');
      expect(prepareStreamingMarkdown('- **粗体*')).toBe('- **粗体**');
      expect(prepareStreamingMarkdown('- **粗体**')).toBe('- **粗体**');
      expect(prepareStreamingMarkdown(`- **${'a'.repeat(60)}`)).toBe(`- **${'a'.repeat(60)}**`);
    });

    it.each([
      ['- *斜体', '- *斜体*'],
      ['- _斜体', '- _斜体_'],
      ['- ***粗斜体', '- ***粗斜体***'],
      ['- ***粗斜体*', '- ***粗斜体***'],
      ['- ***粗斜体**', '- ***粗斜体***'],
      ['- ___粗斜体', '- ___粗斜体___'],
      ['- ___粗斜体_', '- ___粗斜体___'],
      ['- ___粗斜体__', '- ___粗斜体___'],
      ['- ~~删除', '- ~~删除~~'],
      ['- ~~删除~', '- ~~删除~~'],
      ['- `代码', '- `代码`'],
      ['- $$x^2', '- $$x^2$$']
    ])('should complete streaming inline syntax %s', (source, expected) => {
      expect(prepareStreamingMarkdown(source)).toBe(expected);
    });

    it.each([
      ['- **粗体 *斜体', '- **粗体 *斜体***'],
      ['- **粗体 *斜体*', '- **粗体 *斜体***'],
      ['- **粗体 *斜体**', '- **粗体 *斜体***'],
      ['- *斜体 **粗体', '- *斜体 **粗体***'],
      ['- ~~删除 **粗体', '- ~~删除 **粗体**~~']
    ])(
      'should preserve nested emphasis while the closing suffix arrives: %s',
      (source, expected) => {
        expect(prepareStreamingMarkdown(source)).toBe(expected);
      }
    );

    it('should delay unresolved block control markers and task items', () => {
      [
        '-',
        '- ',
        '* ',
        '1',
        '1.',
        '1. ',
        '> ',
        '# ',
        '**',
        '~~',
        '$$',
        '`',
        '``',
        '- [',
        '- [ ]',
        '- [x] ',
        '- **',
        '- `'
      ].forEach((source) => {
        expect(prepareStreamingMarkdown(source)).toBe('');
      });

      expect(prepareStreamingMarkdown('- item')).toBe('- item');
      expect(prepareStreamingMarkdown('> quote')).toBe('> quote');
      expect(prepareStreamingMarkdown('# title')).toBe('# title');
      expect(prepareStreamingMarkdown('- [ ] task')).toBe('- [ ] task');
    });

    it('should delay a potential table until its delimiter row is complete', () => {
      expect(prepareStreamingMarkdown('|')).toBe('');
      expect(prepareStreamingMarkdown('| key')).toBe('');
      expect(prepareStreamingMarkdown('| key |')).toBe('');
      expect(prepareStreamingMarkdown('| key | value |')).toBe('');
      expect(prepareStreamingMarkdown('| key | value |\n| -')).toBe('');
      expect(prepareStreamingMarkdown('| key | value |\n| --- | --- |')).toBe(
        '| key | value |\n| --- | --- |'
      );
      expect(prepareStreamingMarkdown('| key | value |\nplain')).toBe('| key | value |\nplain');
    });

    it('should not repair markdown inside inline or fenced code', () => {
      expect(prepareStreamingMarkdown('`**code')).toBe('`**code`');
      expect(prepareStreamingMarkdown('`` **code')).toBe('`` **code``');
      expect(prepareStreamingMarkdown('`` $code')).toBe('`` $code``');
      expect(prepareStreamingMarkdown('`` `**code`')).toBe('`` `**code` ``');
      expect(prepareStreamingMarkdown('```md\n**code')).toBe('```md\n**code');
      expect(prepareStreamingMarkdown('```md\n- ')).toBe('```md\n- ');
      expect(prepareStreamingMarkdown('before\n\n```md\n| code')).toBe('before\n\n```md\n| code');
      expect(prepareStreamingMarkdown('~~~md\n**code')).toBe('~~~md\n**code');
    });

    it('should continue hiding incomplete images and links', () => {
      expect(prepareStreamingMarkdown('- ![alt](https://example.com/a.png')).toBe('');
      expect(prepareStreamingMarkdown('- [doc](https://example.com/page')).toBe('');
    });

    it('should preserve one trailing space after visible content', () => {
      expect(prepareStreamingMarkdown('- ')).toBe('');
      expect(prepareStreamingMarkdown('- **bold ')).toBe('- **bold** ');
      expect(prepareStreamingMarkdown('text  ')).toBe('text  ');
    });

    it('should preserve a populated list item that ends with one trailing space', () => {
      const source = [
        '好的，我来为你详细介绍 FastGPT。',
        'FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，它将智能对话与可视化编排完美结合，让 AI 应用开发变得简单自然，无论是开发者还是业务人员都能轻松打造专属的 AI 应用[69db8e1aa2409f01b117897e](CITE)。',
        '### FastGPT 的优势',
        '*   **简单灵活，像搭积木一样简单 🧱**：FastGPT 提供了丰富的功能模块，通过简单拖拽就能搭建出个性化的 '
      ].join('\n\n');

      expect(prepareStreamingMarkdown(source)).toBe(source);
    });
  });
});
