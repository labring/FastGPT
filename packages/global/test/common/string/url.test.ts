import { describe, expect, it } from 'vitest';
import { isSafeHref, isSafeImgSrc, stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';

describe('url utils', () => {
  describe('stripUrlTrailingSlash', () => {
    it('should strip trailing slash', () => {
      expect(stripUrlTrailingSlash('https://example.com/')).toBe('https://example.com');
      expect(stripUrlTrailingSlash('https://example.com///')).toBe('https://example.com');
      expect(stripUrlTrailingSlash('https://example.com/path/')).toBe('https://example.com/path');
      expect(stripUrlTrailingSlash('https://example.com')).toBe('https://example.com');
      expect(stripUrlTrailingSlash('')).toBe('');
      expect(stripUrlTrailingSlash(undefined)).toBe('');
    });
  });

  describe('isSafeHref', () => {
    it('should allow valid http/https URLs', () => {
      expect(isSafeHref('https://fastgpt.io')).toBe(true);
      expect(isSafeHref('http://fastgpt.io')).toBe(true);
      expect(isSafeHref('https://example.com/path?foo=bar#hash')).toBe(true);
      expect(isSafeHref('https://example.com:8080/test')).toBe(true);
    });

    it('should allow mailto and tel links', () => {
      expect(isSafeHref('mailto:support@fastgpt.io')).toBe(true);
      expect(isSafeHref('mailto:user@example.com?subject=Hello%20World')).toBe(true);
      expect(isSafeHref('tel:10086')).toBe(true);
      expect(isSafeHref('tel:+86-10086')).toBe(true);
    });

    it('should allow relative paths and in-page hash anchors', () => {
      expect(isSafeHref('/chat')).toBe(true);
      expect(isSafeHref('/chat/detail?id=123')).toBe(true);
      expect(isSafeHref('./docs/readme.md')).toBe(true);
      expect(isSafeHref('../docs/readme.md')).toBe(true);
      expect(isSafeHref('#section-1')).toBe(true);
      expect(isSafeHref('#heading:anchor')).toBe(true);
      expect(isSafeHref('path/to/page')).toBe(true);
      expect(isSafeHref('path?query=http://example.com')).toBe(true);
    });

    it('should allow FastGPT citation and quote references', () => {
      expect(isSafeHref('CITE')).toBe(true);
      expect(isSafeHref('QUOTE')).toBe(true);
      expect(isSafeHref('cite:675934a198f46329dfc6d05a')).toBe(true);
      expect(isSafeHref('quote:675934a198f46329dfc6d05a')).toBe(true);
    });

    it('should block javascript: pseudo-protocols in various forms', () => {
      expect(isSafeHref('javascript:alert(1)')).toBe(false);
      expect(isSafeHref('JavaScript:alert(1)')).toBe(false);
      expect(isSafeHref('JAVASCRIPT:alert(1)')).toBe(false);
      expect(isSafeHref(' javascript:alert(1)')).toBe(false);
      expect(isSafeHref('\tjavascript:alert(1)')).toBe(false);
      expect(isSafeHref('\njavascript:alert(1)')).toBe(false);
      expect(isSafeHref('java\tscript:alert(1)')).toBe(false);
      expect(isSafeHref('java\nscript:alert(1)')).toBe(false);
      expect(isSafeHref('java\rscript:alert(1)')).toBe(false);
      expect(isSafeHref('java\0script:alert(1)')).toBe(false);
      expect(isSafeHref('java\x01script:alert(1)')).toBe(false);
      expect(isSafeHref('javascript&colon;alert(1)')).toBe(false);
      expect(isSafeHref('jav&#x09;ascript:alert(1)')).toBe(false);
      expect(isSafeHref('jav&#58;alert(1)')).toBe(false);
      expect(isSafeHref('javascript%3Aalert(1)')).toBe(false);
      expect(isSafeHref('%6a%61%76%61%73%63%72%69%70%74:alert(1)')).toBe(false);
    });

    it('should block vbscript: and data: pseudo-protocols for links', () => {
      expect(isSafeHref('vbscript:alert(1)')).toBe(false);
      expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeHref('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
      expect(isSafeHref('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
    });

    it('should block file:, blob:, and unknown schemes', () => {
      expect(isSafeHref('file:///etc/passwd')).toBe(false);
      expect(isSafeHref('blob:https://example.com/uuid')).toBe(false);
      expect(isSafeHref('customscheme:test')).toBe(false);
    });

    it('should return false for empty or non-string inputs', () => {
      expect(isSafeHref('')).toBe(false);
      expect(isSafeHref('   ')).toBe(false);
      expect(isSafeHref(undefined)).toBe(false);
      expect(isSafeHref(null as any)).toBe(false);
      expect(isSafeHref(123 as any)).toBe(false);
    });
  });

  describe('isSafeImgSrc', () => {
    it('should allow valid http/https and relative paths for images', () => {
      expect(isSafeImgSrc('https://fastgpt.io/logo.png')).toBe(true);
      expect(isSafeImgSrc('/imgs/errImg.png')).toBe(true);
      expect(isSafeImgSrc('./icon.svg')).toBe(true);
    });

    it('should allow safe base64 data URIs for images', () => {
      expect(isSafeImgSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
      expect(isSafeImgSrc('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
      expect(isSafeImgSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true);
    });

    it('should block dangerous image sources', () => {
      expect(isSafeImgSrc('javascript:alert(1)')).toBe(false);
      expect(isSafeImgSrc('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeImgSrc('file:///etc/passwd')).toBe(false);
    });
  });
});
