import { describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  getSandboxRuntimePaths,
  getSandboxSessionPathSegment,
  resolveSandboxRuntimePath
} from '@fastgpt/service/core/ai/sandbox/utils';

describe('sandbox runtime paths', () => {
  it('derives App session and Skill Edit workspace paths', () => {
    expect(
      getSandboxRuntimePaths({
        sourceType: ChatSourceTypeEnum.app,
        workDirectory: '/workspace/',
        chatId: 'chat-1'
      })
    ).toEqual({
      workspaceRoot: '/workspace',
      runtimeSkillsRoot: '/workspace/projects',
      sessionWorkDirectory: '/workspace/sessions/chat-1'
    });
    expect(
      getSandboxRuntimePaths({
        sourceType: ChatSourceTypeEnum.skillEdit,
        workDirectory: '/workspace',
        chatId: 'edit-debug'
      })
    ).toEqual({
      workspaceRoot: '/workspace',
      runtimeSkillsRoot: '/workspace/projects',
      sessionWorkDirectory: '/workspace'
    });
  });

  it('anchors relative files to the session and permits workspace absolute paths explicitly', () => {
    const paths = {
      workspaceRoot: '/workspace',
      sessionWorkDirectory: '/workspace/sessions/chat-1'
    };

    expect(resolveSandboxRuntimePath('src/index.ts', paths)).toBe(
      '/workspace/sessions/chat-1/src/index.ts'
    );
    expect(
      resolveSandboxRuntimePath('/workspace/projects/a/SKILL.md', paths, {
        allowAbsolutePath: true
      })
    ).toBe('/workspace/projects/a/SKILL.md');
    expect(() =>
      resolveSandboxRuntimePath('/etc/passwd', paths, { allowAbsolutePath: true })
    ).toThrow('Sandbox path is outside workspace');
    expect(() => resolveSandboxRuntimePath('../other-chat/file', paths)).toThrow(
      'Path traversal detected'
    );
  });

  it('encodes unusual Chat IDs into one stable path segment', () => {
    expect(getSandboxSessionPathSegment('chat/with spaces')).toBe('chat%2Fwith%20spaces');
    expect(getSandboxSessionPathSegment('.')).toMatch(/^chat-[0-9a-f]{40}$/);
  });
});
