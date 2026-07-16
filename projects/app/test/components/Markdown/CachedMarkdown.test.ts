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
import { prepareStreamingMarkdown } from '@/components/Markdown/utils';

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

  it('should render stable stream characters with a cached processor', () => {
    const html = renderToStaticMarkup(
      React.createElement(CachedMarkdown, {
        source: 'hello',
        remarkPlugins,
        rehypePlugins: [
          ...baseRehypePlugins,
          [
            rehypeStreamAnimated,
            {
              fadeDuration: 180,
              nowMs: 100,
              runtime: { births: [100, 102, 104, 106, 108], styles: [] }
            }
          ]
        ]
      })
    );

    expect(html).toContain('class="stream-char"');
    expect(html).toContain('animation-delay:8ms');
    expect(html).not.toContain('stream-tail');
  });

  it.each([
    {
      expected: '<strong>',
      frames: ['- **粗', '- **粗体*', '- **粗体**'],
      name: 'bold'
    },
    {
      expected: '<em>',
      frames: ['- *斜', '- *斜体', '- *斜体*'],
      name: 'italic'
    },
    {
      expected: '<em><strong>',
      frames: ['- ***粗', '- ***粗斜*', '- ***粗斜**', '- ***粗斜***'],
      name: 'bold italic'
    },
    {
      expected: '<em><strong>',
      frames: ['- ___粗', '- ___粗斜_', '- ___粗斜__', '- ___粗斜___'],
      name: 'underscore bold italic'
    },
    {
      expected: '<strong>',
      frames: ['- **粗 *斜', '- **粗 *斜*', '- **粗 *斜**', '- **粗 *斜***'],
      name: 'nested emphasis'
    },
    {
      expected: '<del>',
      frames: ['- ~~删', '- ~~删除~', '- ~~删除~~'],
      name: 'strikethrough'
    },
    {
      expected: '<code>',
      frames: ['- `代', '- `代码', '- `代码`'],
      name: 'inline code'
    },
    {
      expected: 'class="katex"',
      frames: ['- $$x', '- $$x^2', '- $$x^2$$'],
      name: 'math'
    }
  ])('should keep $name structure stable across streaming frames', ({ expected, frames }) => {
    const htmlFrames = frames.map((source) =>
      renderToStaticMarkup(
        React.createElement(
          ReactMarkdown,
          {
            rehypePlugins: baseRehypePlugins,
            remarkPlugins
          } as any,
          prepareStreamingMarkdown(source)
        )
      )
    );

    htmlFrames.forEach((html) => {
      expect(html).toContain('<ul>');
      expect(html).toContain(expected);
    });
  });

  it('should delay block controls, task markers, and tables until their structure is stable', () => {
    ['-', '- ', '> ', '# ', '- [', '- [ ]', '| key | value |\n| -'].forEach((source) => {
      expect(prepareStreamingMarkdown(source)).toBe('');
    });

    const taskHtml = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        { remarkPlugins } as any,
        prepareStreamingMarkdown('- [ ] task')
      )
    );
    const tableHtml = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        { remarkPlugins } as any,
        prepareStreamingMarkdown('| key | value |\n| --- | --- |')
      )
    );

    expect(taskHtml).toContain('type="checkbox"');
    expect(tableHtml).toContain('<table>');
  });

  it('should not reveal a link label before the complete anchor can be rendered', () => {
    ['[', '[doc', '[doc]', '[doc](', '[doc](https://example.com'].forEach((source) => {
      expect(prepareStreamingMarkdown(source)).toBe('');
    });

    const linkHtml = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        null,
        prepareStreamingMarkdown('[doc](https://example.com)')
      )
    );
    expect(linkHtml).toContain('<a href="https://example.com">doc</a>');
  });
});
