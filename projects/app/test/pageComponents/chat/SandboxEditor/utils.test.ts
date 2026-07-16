import { describe, expect, it } from 'vitest';
import {
  getSandboxIdeSessionRoot,
  scopeSandboxIdeRpcParams
} from '@/pageComponents/chat/SandboxEditor/utils';

describe('SandboxEditor session RPC paths', () => {
  it('derives the IDE Agent relative root from ticket paths', () => {
    expect(getSandboxIdeSessionRoot('/workspace', '/workspace/sessions/chat-1')).toBe(
      'sessions/chat-1'
    );
    expect(getSandboxIdeSessionRoot('/workspace/', '/workspace/')).toBe('.');
    expect(() => getSandboxIdeSessionRoot('/workspace', '/other/chat-1')).toThrow(
      'Sandbox session directory is outside workspace'
    );
  });

  it('prefixes filesystem path and move parameters without changing UI paths', () => {
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

  it('runs IDE Agent exec commands from the Chat session directory', () => {
    expect(
      scopeSandboxIdeRpcParams('fs/exec', { command: 'pwd', timeoutMs: 1000 }, 'sessions/chat-1')
    ).toEqual({
      command: "mkdir -p 'sessions/chat-1' && cd 'sessions/chat-1' && pwd",
      timeoutMs: 1000
    });
  });
});
