import { describe, expect, it } from 'vitest';
import {
  getSandboxIdeSessionRoot,
  isValidSandboxPathSegment,
  resolveSandboxAbsolutePaths,
  scopeSandboxIdeRpcParams
} from '@/pageComponents/chat/SandboxEditor/utils';

describe('SandboxEditor session RPC paths', () => {
  it('validates single path segments', () => {
    expect(isValidSandboxPathSegment('file.txt')).toBe(true);
    expect(isValidSandboxPathSegment('nested-dir')).toBe(true);
    expect(isValidSandboxPathSegment('')).toBe(false);
    expect(isValidSandboxPathSegment('.')).toBe(false);
    expect(isValidSandboxPathSegment('..')).toBe(false);
    expect(isValidSandboxPathSegment('a/b')).toBe(false);
    expect(isValidSandboxPathSegment('a\\b')).toBe(false);
    expect(isValidSandboxPathSegment('bad\u0000name')).toBe(false);
  });

  it('derives the IDE Agent relative root from ticket paths', () => {
    expect(getSandboxIdeSessionRoot('/workspace', '/workspace/sessions/chat-1')).toBe(
      'sessions/chat-1'
    );
    expect(getSandboxIdeSessionRoot('/workspace/', '/workspace/')).toBe('.');
    expect(() => getSandboxIdeSessionRoot('/workspace', '/other/chat-1')).toThrow(
      'Sandbox session directory is outside workspace'
    );
  });

  it('scopes filesystem RPC parameters to the Chat session', () => {
    expect(
      scopeSandboxIdeRpcParams('fs/read_file', { path: 'src/index.ts' }, 'sessions/chat-1')
    ).toEqual({ path: 'sessions/chat-1/src/index.ts' });
    expect(
      scopeSandboxIdeRpcParams('fs/move', { from: 'src/a.ts', to: 'src/b.ts' }, 'sessions/chat-1')
    ).toEqual({
      from: 'sessions/chat-1/src/a.ts',
      to: 'sessions/chat-1/src/b.ts'
    });
    expect(
      scopeSandboxIdeRpcParams('fs/read_dir_recursive', { path: '.' }, 'sessions/chat-1')
    ).toEqual({ path: 'sessions/chat-1' });
  });

  it('resolves container absolute paths from sessionWorkDirectory without RPC execution', () => {
    expect(
      resolveSandboxAbsolutePaths('/workspace/sessions/chat-1/', ['.', 'src/index.ts', './a/b'])
    ).toEqual([
      '/workspace/sessions/chat-1',
      '/workspace/sessions/chat-1/src/index.ts',
      '/workspace/sessions/chat-1/a/b'
    ]);
    expect(resolveSandboxAbsolutePaths('/', ['./file.txt'])).toEqual(['/file.txt']);
    expect(() => resolveSandboxAbsolutePaths('/workspace', ['../secret'])).toThrow(
      'Invalid sandbox path'
    );
    expect(() => resolveSandboxAbsolutePaths('/workspace', ['/etc/passwd'])).toThrow(
      'Invalid sandbox path'
    );
    expect(() => resolveSandboxAbsolutePaths('/workspace', ['bad\u0000name'])).toThrow(
      'Invalid sandbox path'
    );
  });
});
