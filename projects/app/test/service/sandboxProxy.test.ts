import { describe, it, expect } from 'vitest';
import { parseSubdomainProxy, rewriteHtml } from '@/service/core/sandbox/proxyUtils';

describe('parseSubdomainProxy', () => {
  it('returns null for undefined host', () => {
    expect(parseSubdomainProxy(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSubdomainProxy('')).toBeNull();
  });

  it('returns null for plain localhost', () => {
    expect(parseSubdomainProxy('localhost:3000')).toBeNull();
  });

  it('returns null for normal domain without port-sandboxId prefix', () => {
    expect(parseSubdomainProxy('example.com')).toBeNull();
    expect(parseSubdomainProxy('app.example.com')).toBeNull();
  });

  it('parses valid subdomain with host port', () => {
    expect(parseSubdomainProxy('5000-abcdefgh1234.localhost:3000')).toEqual({
      port: 5000,
      sandboxId: 'abcdefgh1234'
    });
  });

  it('parses valid subdomain without host port', () => {
    expect(parseSubdomainProxy('8080-abc123defabc1.example.com')).toEqual({
      port: 8080,
      sandboxId: 'abc123defabc1'
    });
  });

  it('parses 16-char sandboxId', () => {
    expect(parseSubdomainProxy('3000-a1b2c3d4e5f6g7h8.localhost')).toEqual({
      port: 3000,
      sandboxId: 'a1b2c3d4e5f6g7h8'
    });
  });

  it('returns null when sandboxId is shorter than 8 chars', () => {
    expect(parseSubdomainProxy('5000-short.localhost')).toBeNull();
  });

  it('returns null when sandboxId is longer than 32 chars', () => {
    expect(
      parseSubdomainProxy('5000-averylongsandboxidthatexceedsthethirtytwocharacterlimit.localhost')
    ).toBeNull();
  });

  it('returns null for port 0', () => {
    expect(parseSubdomainProxy('0-abcdefgh1234.localhost')).toBeNull();
  });

  it('returns null for port > 65535', () => {
    expect(parseSubdomainProxy('99999-abcdefgh1234.localhost')).toBeNull();
  });

  it('returns null for port 65535 boundary', () => {
    expect(parseSubdomainProxy('65535-abcdefgh1234.localhost')).toEqual({
      port: 65535,
      sandboxId: 'abcdefgh1234'
    });
  });

  it('returns null for port 65536 (just over boundary)', () => {
    expect(parseSubdomainProxy('65536-abcdefgh1234.localhost')).toBeNull();
  });

  // double-hyphen format (sandboxId with hyphens)
  it('double-hyphen: parses UUID sandboxId', () => {
    const result = parseSubdomainProxy('55914--a535c42a-9c94-4aa3-8953-db78bb96d56b.example.com');
    expect(result).toEqual({ port: 55914, sandboxId: 'a535c42a-9c94-4aa3-8953-db78bb96d56b' });
  });

  it('double-hyphen: parses with host port suffix', () => {
    const result = parseSubdomainProxy(
      '55914--a535c42a-9c94-4aa3-8953-db78bb96d56b.example.com:3000'
    );
    expect(result).toEqual({ port: 55914, sandboxId: 'a535c42a-9c94-4aa3-8953-db78bb96d56b' });
  });

  it('double-hyphen: returns null if sandboxId starts with hyphen', () => {
    expect(parseSubdomainProxy('55914---bad-id.example.com')).toBeNull();
  });

  it('double-hyphen: returns null if sandboxId ends with hyphen', () => {
    expect(parseSubdomainProxy('55914--a535c42a-.example.com')).toBeNull();
  });

  // legacy single-hyphen format still works
  it('legacy: still parses alphanumeric sandboxId', () => {
    const result = parseSubdomainProxy('55914-a535c42a9c944aa38953db78bb96d56b.example.com');
    expect(result).toEqual({ port: 55914, sandboxId: 'a535c42a9c944aa38953db78bb96d56b' });
  });
});

describe('rewriteHtml', () => {
  const basePath = '/absproxy/abc123def456/5000';

  it('injects <base> tag right after <head> opening tag', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`<head><base href="${basePath}/">`);
  });

  it('handles <head> with attributes', () => {
    const html = '<html><head lang="en"><title>Test</title></head><body></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`<head lang="en"><base href="${basePath}/">`);
  });

  it('rewrites absolute src paths', () => {
    const html = '<html><head></head><body><script src="/app.js"></script></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`src="${basePath}/app.js"`);
  });

  it('rewrites absolute href paths', () => {
    const html = '<html><head><link href="/style.css"></head><body></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`href="${basePath}/style.css"`);
  });

  it('rewrites action attributes', () => {
    const html = '<html><head></head><body><form action="/submit"></form></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`action="${basePath}/submit"`);
  });

  it('does not rewrite protocol-relative URLs (//)', () => {
    const html = '<html><head></head><body><a href="//example.com">x</a></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain('href="//example.com"');
  });

  it('does not rewrite relative paths', () => {
    const html = '<html><head></head><body><a href="relative/path">x</a></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain('href="relative/path"');
  });

  it('rewrites url() in inline CSS with absolute paths', () => {
    const html = '<html><head></head><body style="background: url(/img.png)"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`url(${basePath}/img.png)`);
  });

  it('rewrites url() with quoted paths', () => {
    const html = '<html><head></head><body style="background: url(\'/img.png\')"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`url('${basePath}/img.png')`);
  });

  it('does not rewrite url() with protocol-relative paths', () => {
    const html =
      '<html><head></head><body style="background: url(//example.com/img.png)"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain('url(//example.com/img.png)');
  });

  it('rewrites multiple occurrences', () => {
    const html = '<html><head></head><body><img src="/a.png"><img src="/b.png"></body></html>';
    const result = rewriteHtml(html, basePath);
    expect(result).toContain(`src="${basePath}/a.png"`);
    expect(result).toContain(`src="${basePath}/b.png"`);
  });
});
