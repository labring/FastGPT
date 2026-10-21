import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { htmlTable2Md, parseMarkdownBase64Images } from '@fastgpt/global/common/string/markdown';
import { CachedMarkdown } from '@/components/Markdown/stream/CachedMarkdown';
import {
  markdownBaseRehypePlugins,
  markdownRemarkPlugins
} from '@/components/Markdown/utils/plugins';

const renderMarkdown = (source: string) =>
  renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: markdownRemarkPlugins, rehypePlugins: markdownBaseRehypePlugins },
      source
    )
  );

describe('rehypeTablePipes', () => {
  it.each(['|x|', 'P(A|B)', String.raw`\|x\|`, String.raw`\begin{array}{c|c}a & b\end{array}`])(
    'Doc2x 表格转换后保留公式含义：%s',
    async (formula) => {
      const htmlTable = `<table><tr><th>公式|类型</th><th>备注</th></tr><tr><td>$${formula}$</td><td>OK</td></tr></table>`;
      const markdown = htmlTable2Md(await parseMarkdownBase64Images(htmlTable));
      const rendered = renderMarkdown(markdown);
      const expectedMath = renderMarkdown(`$${formula}$`).match(/<math[\s\S]*?<\/math>/)?.[0];

      expect(expectedMath).toBeDefined();
      expect(rendered).not.toContain('katex-error');
      expect(rendered.match(/<math[\s\S]*?<\/math>/)?.[0]).toBe(expectedMath);
      expect(rendered).toContain('<th>公式|类型</th>');
      expect(rendered.match(/<th>/g)).toHaveLength(2);
      expect(rendered.match(/<td>/g)).toHaveLength(2);
      expect(rendered).toContain('<td>OK</td>');
      expect(
        renderToStaticMarkup(
          React.createElement(CachedMarkdown, {
            source: markdown,
            remarkPlugins: markdownRemarkPlugins,
            rehypePlugins: markdownBaseRehypePlugins
          })
        )
      ).toBe(rendered);
    }
  );

  it('保留普通文本、行内代码及不同反斜杠数量下的列结构', () => {
    const cells = ['A|B', String.raw`A\|B`, String.raw`A\\|B`, String.raw`A\\\|B`, '`A|B`'];
    const htmlTable = `<table><tr><th>内容</th><th>备注</th></tr>${cells
      .map((cell) => `<tr><td>${cell}</td><td>OK</td></tr>`)
      .join('')}</table>`;
    const rendered = renderMarkdown(htmlTable2Md(htmlTable));

    expect(rendered.match(/<td>/g)).toHaveLength(10);
    expect(rendered.match(/<td>A\|B<\/td>/g)).toHaveLength(2);
    expect(rendered.match(/<td>A\\\|B<\/td>/g)).toHaveLength(2);
    expect(rendered).toContain('<td><code>A|B</code></td>');
    expect(rendered.match(/<td>OK<\/td>/g)).toHaveLength(5);
  });

  it('只恢复管道符实体，保留代码中的其他实体和 HTML 字面量', () => {
    const markdown = htmlTable2Md(
      '<table><tr><th>代码</th></tr><tr><td>`&amp;|<script>`</td></tr></table>'
    );

    expect(renderMarkdown(markdown)).toContain('<code>&amp;amp;|&lt;script&gt;</code>');
  });

  it('保留表格外公式及代码中的管道符实体字面量', () => {
    const rendered = renderMarkdown('$&#124;$\n\n`&#124;`');

    expect(rendered).toContain('katex-error');
    expect(rendered).toContain('<code>&amp;#124;</code>');
  });
});
