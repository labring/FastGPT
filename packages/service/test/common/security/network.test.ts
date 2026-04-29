import { describe, it, expect } from 'vitest';
import {
  isAbsoluteUrl,
  assertRelativePath,
  buildSameOriginUrl
} from '@fastgpt/service/common/security/network';

describe('common/security/network', () => {
  describe('isAbsoluteUrl', () => {
    it.each([
      ['http://example.com', true],
      ['https://example.com/path', true],
      ['HTTP://EXAMPLE.COM', true], // 协议大小写不敏感
      ['ws://example.com', true],
      ['wss://example.com', true],
      ['ftp://example.com', true],
      ['file:///etc/passwd', true],
      ['javascript:alert(1)', false], // 没有 :// 不算
      ['//example.com/path', true], // protocol-relative
      ['//169.254.169.254/latest/meta-data/', true],
      ['/api/foo', false],
      ['api/foo', false],
      ['', false],
      ['?query=1', false],
      ['#hash', false]
    ])('isAbsoluteUrl(%j) === %s', (input, expected) => {
      expect(isAbsoluteUrl(input)).toBe(expected);
    });

    it('non-string 输入一律返回 false', () => {
      expect(isAbsoluteUrl(undefined)).toBe(false);
      expect(isAbsoluteUrl(null)).toBe(false);
      expect(isAbsoluteUrl(123)).toBe(false);
      expect(isAbsoluteUrl({})).toBe(false);
    });
  });

  describe('assertRelativePath', () => {
    it('相对路径不抛错', () => {
      expect(() => assertRelativePath('/api/foo')).not.toThrow();
      expect(() => assertRelativePath('api/foo')).not.toThrow();
      expect(() => assertRelativePath('support/outLink/wecom/abc')).not.toThrow();
    });

    it.each([
      'http://example.com',
      'https://169.254.169.254/latest/meta-data/',
      '//attacker.example/probe',
      'ws://internal/socket'
    ])('绝对 URL 抛错: %j', (url) => {
      expect(() => assertRelativePath(url)).toThrow(/only accepts relative paths/i);
    });

    it('non-string 抛错', () => {
      expect(() => assertRelativePath(undefined)).toThrow(/only accepts relative paths/i);
      expect(() => assertRelativePath(null)).toThrow(/only accepts relative paths/i);
    });

    it('错误信息包含调用者名称,便于定位', () => {
      expect(() => assertRelativePath('http://x', 'plusRequest')).toThrow(/plusRequest/);
      expect(() => assertRelativePath('http://x', 'serverRequest')).toThrow(/serverRequest/);
    });
  });

  describe('buildSameOriginUrl', () => {
    const base = 'http://internal-service:3000';

    it('普通相对路径正常拼接', () => {
      const u = buildSameOriginUrl('/api/foo', base);
      expect(u.href).toBe('http://internal-service:3000/api/foo');
    });

    it('保留 query 与 hash', () => {
      const u = buildSameOriginUrl('/api/foo?x=1#bar', base);
      expect(u.href).toBe('http://internal-service:3000/api/foo?x=1#bar');
    });

    it('保留 base 自带 path 的相对解析行为', () => {
      const u = buildSameOriginUrl('foo', 'http://h:3000/api/');
      expect(u.href).toBe('http://h:3000/api/foo');
    });

    it.each([
      // protocol-relative URL 直接覆盖主机
      '//169.254.169.254/latest/meta-data/',
      '//attacker.example/probe',
      // NextJS catch-all 拼接产物: requestPath = `/${['', 'evil', 'x'].join('/')}` = `//evil/x`
      '//evil.example/path',
      // 绝对 URL 也会替换主机
      'http://attacker.example/x',
      'https://169.254.169.254/',
      // 协议 + 主机 + 不同端口
      'http://internal-service:9999/'
    ])('protocol-relative / 绝对 URL 改写主机时抛错: %j', (path) => {
      expect(() => buildSameOriginUrl(path, base)).toThrow(/does not match base/i);
    });

    it('host 相同但端口不同也算不同 origin', () => {
      expect(() => buildSameOriginUrl('//internal-service:9999/x', base)).toThrow(
        /does not match base/i
      );
    });

    it('host 相同但协议不同也算不同 origin', () => {
      expect(() => buildSameOriginUrl('https://internal-service:3000/', base)).toThrow(
        /does not match base/i
      );
    });

    it('base 非法 URL 时抛错', () => {
      expect(() => buildSameOriginUrl('/api/foo', 'not a url')).toThrow();
    });

    it('NextJS catch-all 真实场景: path 含空段产生 protocol-relative', () => {
      // 模拟 `req.query.path = ['', '169.254.169.254', 'latest']` (来源: /aiproxy//169.254.169.254/latest)
      const requestPath = `/${['', '169.254.169.254', 'latest'].join('/')}`;
      expect(requestPath).toBe('//169.254.169.254/latest');
      expect(() => buildSameOriginUrl(requestPath, base)).toThrow(/does not match base/i);
    });
  });
});
