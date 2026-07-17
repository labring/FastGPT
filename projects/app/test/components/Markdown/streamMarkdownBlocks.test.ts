import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import RemarkBreaks from 'remark-breaks';
import RemarkMath from 'remark-math';
import RemarkGfm from 'remark-gfm';
import RehypeExternalLinks from 'rehype-external-links';
import RehypeKatex from 'rehype-katex';

import {
  mapMarkdownBlockSources,
  splitMarkdownBlocks
} from '@/components/Markdown/streamMarkdownBlocks';
import { mdTextFormat, prepareStreamingMarkdown } from '@/components/Markdown/utils';

describe('splitMarkdownBlocks', () => {
  it('should return no blocks for empty source', () => {
    expect(splitMarkdownBlocks('')).toEqual([]);
  });

  it('should keep root markdown constructs as complete blocks', () => {
    const source =
      '# title\n\nparagraph\n\n```ts\nconst value = 1;\n```\n\n| key | value |\n| --- | --- |\n| a | b |';

    const blocks = splitMarkdownBlocks(source);

    expect(blocks.map((block) => block.source)).toEqual([
      '# title',
      'paragraph',
      '```ts\nconst value = 1;\n```',
      '| key | value |\n| --- | --- |\n| a | b |'
    ]);
    expect(blocks.map((block) => block.startOffset)).toEqual([
      0,
      source.indexOf('paragraph'),
      source.indexOf('```ts'),
      source.indexOf('| key')
    ]);
  });

  it('should keep lists, quotes, and math expressions in their parent blocks', () => {
    const source = '> quote\n> continuation\n\n- first\n- second\n\n$$\nx^2\n$$\n\ntext';

    expect(splitMarkdownBlocks(source).map((block) => block.source)).toEqual([
      '> quote\n> continuation',
      '- first\n- second',
      '$$\nx^2\n$$',
      'text'
    ]);
  });

  it('should keep reference definitions in one document block', () => {
    const source = '[link][reference]\n\n[reference]: https://example.com';

    expect(splitMarkdownBlocks(source)).toEqual([{ source, startOffset: 0 }]);
  });

  it('should keep GFM footnote definitions in one document block', () => {
    const source = 'text[^1]\n\n[^1]: footnote';

    expect(splitMarkdownBlocks(source)).toEqual([{ source, startOffset: 0 }]);
  });

  it('should preserve a non-empty whitespace-only source as a fallback block', () => {
    expect(splitMarkdownBlocks('  \n')).toEqual([{ source: '  \n', startOffset: 0 }]);
  });

  it('should use JavaScript source offsets without splitting surrogate pairs', () => {
    const source = '😀 first\n\nsecond';
    const blocks = splitMarkdownBlocks(source);

    expect(blocks[0]).toEqual({ source: '😀 first', startOffset: 0 });
    expect(blocks[1]).toEqual({ source: 'second', startOffset: source.indexOf('second') });
  });

  it('should preserve CRLF source slices and offsets', () => {
    const source = '# title\r\n\r\nparagraph\r\n\r\nsecond';

    expect(splitMarkdownBlocks(source)).toEqual([
      { source: '# title', startOffset: 0 },
      { source: 'paragraph', startOffset: source.indexOf('paragraph') },
      { source: 'second', startOffset: source.indexOf('second') }
    ]);
  });

  it('should keep an active list block when a streaming frame ends with one space', () => {
    const prefix = [
      '好的，我来为你详细介绍 FastGPT。',
      'FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，它将智能对话与可视化编排完美结合，让 AI 应用开发变得简单自然，无论是开发者还是业务人员都能轻松打造专属的 AI 应用[69db8e1aa2409f01b117897e](CITE)。',
      '### FastGPT 的优势'
    ].join('\n\n');
    const listFrames = [
      '*   **简单灵活，像搭积木一样简单 🧱**：FastGPT 提供了丰富的功能模块，通过简单拖拽就能搭建',
      '*   **简单灵活，像搭积木一样简单 🧱**：FastGPT 提供了丰富的功能模块，通过简单拖拽就能搭建出个性化的 ',
      '*   **简单灵活，像搭积木一样简单 🧱**：FastGPT 提供了丰富的功能模块，通过简单拖拽就能搭建出个性化的 AI 应用'
    ];

    for (const listFrame of listFrames) {
      const source = `${prefix}\n\n${listFrame}`;
      const blocks = splitMarkdownBlocks(prepareStreamingMarkdown(source));

      expect(blocks.at(-1)).toEqual({
        source: listFrame,
        startOffset: source.indexOf(listFrame)
      });
    }
  });

  it.each(['- item ', '* item ', '1. item '])(
    'should preserve a trailing space in list block %s',
    (source) => {
      expect(splitMarkdownBlocks(source)).toEqual([{ source, startOffset: 0 }]);
    }
  );

  it('should keep later block offsets stable when completion formatting grows an earlier block', () => {
    const source = [
      '[form](https://fastgpt.cn/form)[6a3a5576d8bf2d6b2f290c26](CITE)。',
      '### 获取支持',
      '后续内容'
    ].join('\n\n');
    const blocks = splitMarkdownBlocks(source);
    const formattedBlocks = mapMarkdownBlockSources(blocks, mdTextFormat);

    expect(formattedBlocks[0].source).toContain(') [6a3a5576d8bf2d6b2f290c26](CITE)');
    expect(formattedBlocks.map((block) => block.startOffset)).toEqual(
      blocks.map((block) => block.startOffset)
    );
  });

  it('should preserve rendered HTML when stable blocks are rendered independently', () => {
    const source =
      '# title\n\nparagraph with [link](https://example.com)\n\n```ts\nconst value = 1;\n```\n\n| key | value |\n| --- | --- |\n| a | b |';
    const options = {
      remarkPlugins: [RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks],
      rehypePlugins: [RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]]
    };

    const render = (value: string) =>
      renderToStaticMarkup(React.createElement(ReactMarkdown, options as any, value));
    const renderedByBlocks = splitMarkdownBlocks(source)
      .map((block) => render(block.source))
      .join('');

    const normalizeRootWhitespace = (html: string) => html.replace(/>\s+</g, '><');

    expect(normalizeRootWhitespace(renderedByBlocks)).toBe(normalizeRootWhitespace(render(source)));
  });
});
