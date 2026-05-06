import { describe, it, expect } from 'vitest';
import { parseSandboxHost } from '../src/host';

describe('parseSandboxHost', () => {
  it('returns null for empty host', () => {
    expect(parseSandboxHost(undefined)).toBeNull();
    expect(parseSandboxHost('')).toBeNull();
  });

  it('returns null for the bare base host (no subdomain)', () => {
    expect(parseSandboxHost('localhost:3006')).toBeNull();
    expect(parseSandboxHost('proxy.example.com')).toBeNull();
  });

  it("returns null when host doesn't match any configured base", () => {
    expect(parseSandboxHost('evil.com')).toBeNull();
    expect(parseSandboxHost('evil.example.com')).toBeNull();
    expect(parseSandboxHost('localhost:3000')).toBeNull();
  });

  it('parses a single-label sandbox subdomain', () => {
    expect(parseSandboxHost('abc123.localhost:3006')).toEqual({
      sandboxId: 'abc123',
      baseHost: 'localhost:3006'
    });
  });

  it('handles UUID-style sandboxIds', () => {
    expect(parseSandboxHost('94ca8d87-f521-44a9-95e2-54ec7d3fd0a6.localhost:3006')).toEqual({
      sandboxId: '94ca8d87-f521-44a9-95e2-54ec7d3fd0a6',
      baseHost: 'localhost:3006'
    });
  });

  it('rejects nested subdomains', () => {
    expect(parseSandboxHost('a.b.localhost:3006')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(parseSandboxHost('ABC.LOCALHOST:3006')).toEqual({
      sandboxId: 'abc',
      baseHost: 'localhost:3006'
    });
  });

  it('matches the second configured base', () => {
    expect(parseSandboxHost('xyz.proxy.example.com')).toEqual({
      sandboxId: 'xyz',
      baseHost: 'proxy.example.com'
    });
  });
});
