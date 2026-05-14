import { describe, it, expect } from 'vitest';
import { parseSandboxHost } from '../src/host';

describe('parseSandboxHost', () => {
  it('returns null for empty host', () => {
    expect(parseSandboxHost(undefined)).toBeNull();
    expect(parseSandboxHost('')).toBeNull();
  });

  it('returns null when the host has no sandbox subdomain', () => {
    expect(parseSandboxHost('localhost:3006')).toBeNull();
    expect(parseSandboxHost('localhost')).toBeNull();
  });

  it('parses the first host label as sandboxId', () => {
    expect(parseSandboxHost('abc123.sandbox.example.com')).toEqual({
      sandboxId: 'abc123'
    });
  });

  it('parses localhost subdomains', () => {
    expect(parseSandboxHost('abc123.localhost:3006')).toEqual({
      sandboxId: 'abc123'
    });
  });

  it('handles UUID-style sandboxIds', () => {
    expect(parseSandboxHost('94ca8d87-f521-44a9-95e2-54ec7d3fd0a6.localhost:3006')).toEqual({
      sandboxId: '94ca8d87-f521-44a9-95e2-54ec7d3fd0a6'
    });
  });

  it('ignores the remaining host labels', () => {
    expect(parseSandboxHost('a.b.localhost:3006')).toEqual({
      sandboxId: 'a'
    });
  });

  it('is case-insensitive', () => {
    expect(parseSandboxHost('ABC.LOCALHOST:3006')).toEqual({
      sandboxId: 'abc'
    });
  });
});
