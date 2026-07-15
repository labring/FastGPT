import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import RemarkBreaks from 'remark-breaks';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeExternalLinks from 'rehype-external-links';
import RehypeKatex from 'rehype-katex';
import { describe, expect, it } from 'vitest';

import { CachedMarkdown } from '@/components/Markdown/CachedMarkdown';
import { rehypeStreamAnimated } from '@/components/Markdown/rehypeStreamAnimated';

const remarkPlugins = [RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks];
const baseRehypePlugins = [RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]];

const normalizeHtml = (html: string) => html.replace(/>\s+</g, '><');

describe('CachedMarkdown', () => {
  it('should preserve ReactMarkdown output for stable markdown blocks', () => {
    const source =
      '# title\n\nparagraph with [link](https://example.com)\n\n```ts\nconst value = 1;\n```';
    const options = {
      remarkPlugins,
      rehypePlugins: baseRehypePlugins
    };

    const expected = renderToStaticMarkup(
      React.createElement(ReactMarkdown, options as any, source)
    );
    const actual = renderToStaticMarkup(
      React.createElement(CachedMarkdown, {
        source,
        ...options
      })
    );

    expect(normalizeHtml(actual)).toBe(normalizeHtml(expected));
  });

  it('should render bounded stream characters through custom components', () => {
    const html = renderToStaticMarkup(
      React.createElement(CachedMarkdown, {
        source: 'hello',
        remarkPlugins,
        rehypePlugins: [...baseRehypePlugins, [rehypeStreamAnimated, { tailLength: 2 }]],
        components: {
          'stream-tail': ({ children }: { children?: React.ReactNode }) =>
            React.createElement('span', { 'data-stream-tail': true }, children),
          'stream-char': ({
            children,
            'data-stream-char-delay': delay
          }: {
            children?: React.ReactNode;
            'data-stream-char-delay'?: number;
          }) =>
            React.createElement(
              'span',
              { style: delay ? { animationDelay: `${delay}ms` } : undefined },
              children
            )
        } as any
      })
    );

    expect(html).toContain('data-stream-tail="true"');
    expect(html).toContain('animation-delay:1ms');
    expect(html).toContain('<span>o</span>');
  });
});
