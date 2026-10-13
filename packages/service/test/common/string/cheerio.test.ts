import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { cheerioToHtml } from '@fastgpt/service/common/string/cheerio';

const toHtml = (body: string, fetchUrl = 'https://example.com/docs/guide/index.html') =>
  cheerioToHtml({ fetchUrl, $: cheerio.load(`<html><body>${body}</body></html>`) }).html;

describe('cheerioToHtml', () => {
  it('should resolve root-relative and protocol-relative links against the page', () => {
    const html = toHtml('<a href="/about">About</a><img src="//cdn.example.com/logo.png">');

    expect(html).toContain('href="https://example.com/about"');
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
  });

  it('should resolve path-relative links and media against the page url', () => {
    const html = toHtml(
      '<a href="install.html">Install</a><a href="../api/index.html">API</a><img src="./images/arch.png"><video src="media/demo.mp4"></video>'
    );

    expect(html).toContain('href="https://example.com/docs/guide/install.html"');
    expect(html).toContain('href="https://example.com/docs/api/index.html"');
    expect(html).toContain('src="https://example.com/docs/guide/images/arch.png"');
    expect(html).toContain('src="https://example.com/docs/guide/media/demo.mp4"');
  });

  it('should leave absolute urls, other schemes and in-page anchors unchanged', () => {
    const html = toHtml(
      '<a href="https://other.com/a">A</a><a href="mailto:me@example.com">Mail</a><a href="#top">Top</a><img src="data:image/png;base64,AAAA">'
    );

    expect(html).toContain('href="https://other.com/a"');
    expect(html).toContain('href="mailto:me@example.com"');
    expect(html).toContain('href="#top"');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });
});
