import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import RemarkBreaks from 'remark-breaks';
import RemarkMath from 'remark-math';
import RemarkGfm from 'remark-gfm';
import RehypeExternalLinks from 'rehype-external-links';
import RehypeKatex from 'rehype-katex';

import { splitMarkdownBlocks } from '@/components/Markdown/streamMarkdownBlocks';

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
