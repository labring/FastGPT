import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import A from '@/components/Markdown/A';
import { CachedMarkdown } from '@/components/Markdown/CachedMarkdown';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (str: string) => str
  })
}));

describe('Markdown A component', () => {
  it('should render safe link as anchor tag', () => {
    const html = renderToStaticMarkup(
      React.createElement(A, { href: 'https://fastgpt.io' } as any, 'FastGPT')
    );

    expect(html).toContain('<a');
    expect(html).toContain('href="https://fastgpt.io"');
    expect(html).toContain('FastGPT');
  });

  it('should render relative and mailto links safely', () => {
    const relativeHtml = renderToStaticMarkup(
      React.createElement(A, { href: '/chat/detail' } as any, 'Chat')
    );
    expect(relativeHtml).toContain('<a');
    expect(relativeHtml).toContain('href="/chat/detail"');

    const mailtoHtml = renderToStaticMarkup(
      React.createElement(A, { href: 'mailto:support@fastgpt.io' } as any, 'Email')
    );
    expect(mailtoHtml).toContain('<a');
    expect(mailtoHtml).toContain('href="mailto:support@fastgpt.io"');
  });

  it('should block javascript: and render as span instead of link', () => {
    const html = renderToStaticMarkup(
      React.createElement(A, { href: 'javascript:alert(1)' } as any, 'Malicious')
    );

    expect(html).not.toContain('<a');
    expect(html).not.toContain('href=');
    expect(html).toContain('<span');
    expect(html).toContain('Malicious');
  });

  it('should block vbscript: and data: links', () => {
    const vbHtml = renderToStaticMarkup(
      React.createElement(A, { href: 'vbscript:alert(1)' } as any, 'VBS')
    );
    expect(vbHtml).not.toContain('<a');
    expect(vbHtml).toContain('<span');

    const dataHtml = renderToStaticMarkup(
      React.createElement(A, { href: 'data:text/html,<script>alert(1)</script>' } as any, 'Data')
    );
    expect(dataHtml).not.toContain('<a');
    expect(dataHtml).toContain('<span');
  });

  it('should sanitize links in CachedMarkdown', () => {
    const components = {
      a: A
    };

    const safeSource = '[Safe](https://example.com)';
    const safeHtml = renderToStaticMarkup(
      React.createElement(CachedMarkdown, {
        source: safeSource,
        components: components as any
      })
    );
    expect(safeHtml).toContain('<a');
    expect(safeHtml).toContain('href="https://example.com"');

    const unsafeSource = '[Unsafe](javascript:alert(1))';
    const unsafeHtml = renderToStaticMarkup(
      React.createElement(CachedMarkdown, {
        source: unsafeSource,
        components: components as any
      })
    );
    expect(unsafeHtml).not.toContain('<a');
    expect(unsafeHtml).not.toContain('javascript:alert(1)');
    expect(unsafeHtml).toContain('<span');
    expect(unsafeHtml).toContain('Unsafe');
  });
});
