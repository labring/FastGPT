import { describe, expect, it } from 'vitest';
import { getFilePreviewSecurityHeaders } from '@fastgpt/service/common/s3/preview';

describe('getFilePreviewSecurityHeaders', () => {
  it.each([
    { contentType: ' Text/HTML; charset=UTF-8 ', filename: 'report.txt' },
    { contentType: 'image/svg+xml', filename: 'image.png' },
    { contentType: 'application/xhtml+xml' },
    { contentType: 'application/xml' },
    { contentType: 'text/xml' },
    { filename: 'REPORT.HTML' },
    { contentType: 'application/octet-stream', filename: 'image.svg' }
  ])('isolates active content without disabling scripts or external resources: %j', (file) => {
    const headers = getFilePreviewSecurityHeaders(file);
    const csp = headers['Content-Security-Policy'];
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/allow-same-origin|allow-popups-to-escape-sandbox|connect-src/);
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cache-Control']).toBe('private, no-store');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it.each([
    {},
    { contentType: 'image/png', filename: 'image.png' },
    { contentType: 'application/pdf', filename: 'report.pdf' },
    { contentType: 'text/plain', filename: 'notes.txt' }
  ])('preserves ordinary file behavior: %j', (file) => {
    expect(getFilePreviewSecurityHeaders(file)).toEqual({});
  });
});
