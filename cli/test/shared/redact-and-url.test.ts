import { describe, expect, it } from 'vitest';
import { assertValidProfileName, sha256Hex } from '../../src/shared/crypto';
import { CliArgumentError, CliAuthError } from '../../src/shared/errors';
import { maskSecret, redactText, redactValue } from '../../src/shared/redact';
import { isLoopbackHost, normalizeBaseUrl, resolveServerAssetUrl } from '../../src/shared/url';

describe('shared utilities', () => {
  it('masks secrets and redacts sensitive strings/objects without mangling paths', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret('123456')).toBe('******');
    expect(maskSecret('abcdefg')).toBe('******defg');
    expect(maskSecret('fastgpt-1234567890abcd')).toBe('fastgpt-******abcd');

    const longKey = 'fastgpt-1234567890abcdef1234567890abcd';
    const raw = `Authorization: Bearer my-secret-token Cookie: fastgpt_token=user1:abc GET /health?apiKey=${longKey} path=/tmp/fastgpt-cli-bun-cfg/config.json {"token":"tok-1","password":"pw"}`;
    const redacted = redactText(raw);

    expect(redacted).not.toContain('my-secret-token');
    expect(redacted).not.toContain('user1:abc');
    expect(redacted).not.toContain(longKey);
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).toContain('fastgpt_token=[REDACTED]');
    expect(redacted).toContain('apiKey=REDACTED');
    expect(redacted).toContain('/tmp/fastgpt-cli-bun-cfg/config.json');

    const source = {
      authorization: 'Bearer secret-xyz',
      nested: { apiKey: 'fastgpt-abcdef123456', note: longKey },
      apiKey: {
        id: 'key-1',
        name: 'CI Key',
        maskedKey: '******3456',
        limit: { maxUsagePoints: 1000, remainingPoints: 50 }
      }
    };
    const safeCopy = redactValue(source);
    expect(safeCopy.authorization).toBe('******-xyz');
    expect(safeCopy.nested.apiKey).toBe('fastgpt-******3456');
    expect(safeCopy.nested.note).toBe('fastgpt-******abcd');
    expect(safeCopy.apiKey).toEqual({
      id: 'key-1',
      name: 'CI Key',
      maskedKey: '******3456',
      limit: { maxUsagePoints: 1000, remainingPoints: 50 }
    });
    expect(source.nested.apiKey).toBe('fastgpt-abcdef123456');
  });

  it('normalizes URLs, checks loopback hosts, validates profile names, and hashes passwords', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('cloud.fastgpt.in')).toBe(false);

    expect(normalizeBaseUrl('https://cloud.fastgpt.in')).toBe('https://cloud.fastgpt.in/api');
    expect(normalizeBaseUrl('https://cloud.fastgpt.in/api/')).toBe('https://cloud.fastgpt.in/api');
    expect(normalizeBaseUrl('https://example.com/sub/')).toBe('https://example.com/sub/api');
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000/api');

    expect(() => normalizeBaseUrl('http://remote.fastgpt.in')).toThrow(CliAuthError);
    expect(normalizeBaseUrl('http://remote.fastgpt.in', { allowInsecureHttp: true })).toBe(
      'http://remote.fastgpt.in/api'
    );
    expect(() => normalizeBaseUrl('ftp://cloud.fastgpt.in')).toThrow(CliAuthError);
    expect(() => normalizeBaseUrl('https://user:pass@cloud.fastgpt.in')).toThrow(CliAuthError);
    expect(() => normalizeBaseUrl('https://cloud.fastgpt.in?foo=bar')).toThrow(CliArgumentError);

    expect(assertValidProfileName(' prod-1.us ')).toBe('prod-1.us');
    expect(() => assertValidProfileName('../bad')).toThrow(CliArgumentError);
    expect(sha256Hex('abc')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves relative server asset paths to accessible URLs including subpath deployments', () => {
    expect(
      resolveServerAssetUrl({
        baseUrl: 'http://localhost:3000/api',
        assetPath: '/api/system/img/avatar/123/file/abc.jpeg'
      })
    ).toBe('http://localhost:3000/api/system/img/avatar/123/file/abc.jpeg');

    expect(
      resolveServerAssetUrl({
        baseUrl: 'https://example.com/fastgpt/api',
        assetPath: '/api/system/img/avatar/123/file/abc.jpeg'
      })
    ).toBe('https://example.com/fastgpt/api/system/img/avatar/123/file/abc.jpeg');

    expect(
      resolveServerAssetUrl({
        baseUrl: 'https://example.com/fastgpt/api',
        assetPath: '/imgs/avatar/BlueAvatar.svg'
      })
    ).toBe('https://example.com/fastgpt/imgs/avatar/BlueAvatar.svg');

    expect(
      resolveServerAssetUrl({
        baseUrl: 'http://localhost:3000/api',
        assetPath: 'https://cdn.example.com/avatar.png'
      })
    ).toBe('https://cdn.example.com/avatar.png');

    expect(
      resolveServerAssetUrl({ baseUrl: 'http://localhost:3000/api', assetPath: null })
    ).toBeNull();
    expect(
      resolveServerAssetUrl({ baseUrl: 'http://localhost:3000/api', assetPath: undefined })
    ).toBeUndefined();
  });
});
