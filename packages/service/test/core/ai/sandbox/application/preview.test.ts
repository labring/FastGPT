import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { serviceEnv } from '@fastgpt/service/env';

const redisMock = vi.hoisted(() => ({
  evalScript: vi.fn(),
  get: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/dal/redis/adapter')>()),
  redisCacheAdapter: redisMock
}));

import {
  buildSandboxPreviewFileUrl,
  createSandboxPreviewFileUrl,
  createSandboxPreviewSession,
  resolveSandboxPreviewPath,
  resolveSandboxPreviewSession,
  SandboxPreviewSessionLimitError
} from '@fastgpt/service/core/ai/sandbox/application/preview';
import {
  SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX,
  SANDBOX_PREVIEW_SESSION_TTL_SECONDS
} from '@fastgpt/service/core/ai/sandbox/constants';

const originalEnv = {
  AGENT_SANDBOX_PROXY_URL: serviceEnv.AGENT_SANDBOX_PROXY_URL,
  AGENT_SANDBOX_PREVIEW_PROXY_URL: serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL,
  AGENT_SANDBOX_PROVIDER: serviceEnv.AGENT_SANDBOX_PROVIDER
};
const sandboxId = generateSandboxId({
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1'
});
const sessionContext = {
  sandboxId,
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  chatId: 'chat-1'
};

describe('sandbox preview application', () => {
  beforeEach(() => {
    Object.assign(serviceEnv, {
      AGENT_SANDBOX_PROXY_URL: 'wss://agent-proxy.example.com/base/',
      AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://agent-preview.example.com:3007/base/',
      AGENT_SANDBOX_PROVIDER: 'opensandbox'
    });
    vi.resetAllMocks();
    redisMock.evalScript.mockResolvedValue(1);
  });

  afterEach(() => {
    Object.assign(serviceEnv, originalEnv);
  });

  it('atomically indexes and creates a 24-character session', async () => {
    const sessionId = await createSandboxPreviewSession(sessionContext);

    expect(sessionId).toMatch(/^[a-z][a-zA-Z0-9]{23}$/);
    const [scriptOptions] = redisMock.evalScript.mock.calls[0];
    expect(scriptOptions.script).toContain('zremrangebyscore');
    expect(scriptOptions.script).toContain('zcard');
    expect(scriptOptions.keys).toEqual([
      `sandbox:preview:${sandboxId}:active`,
      `sandbox:preview:session:${sessionId}`
    ]);
    expect(scriptOptions.args[0]).toEqual(expect.any(Number));
    expect(scriptOptions.args[1]).toBe(SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX);
    expect(JSON.parse(String(scriptOptions.args[2]))).toEqual(sessionContext);
    expect(scriptOptions.args[3]).toBe(SANDBOX_PREVIEW_SESSION_TTL_SECONDS);
    expect(scriptOptions.args[4]).toBe(sessionId);
  });

  it.each(Object.values(ChatSourceTypeEnum))(
    'creates and resolves opaque preview tokens for %s',
    async (sourceType) => {
      const context = {
        ...sessionContext,
        sourceType,
        sandboxId: generateSandboxId({
          sourceType,
          sourceId: sessionContext.sourceId,
          userId: sessionContext.userId
        })
      };
      const url = await createSandboxPreviewFileUrl({
        context,
        filePath: '/workspace/dist/index.html'
      });
      const [scriptOptions] = redisMock.evalScript.mock.calls[0];
      const sessionId = String(scriptOptions.args[4]);

      expect(sessionId).toMatch(/^[a-z][a-zA-Z0-9]{23}$/);
      expect(url).toBe(
        `https://agent-preview.example.com:3007/base/preview/${sessionId}/dist/index.html`
      );
      expect(scriptOptions.keys[0]).toBe(`sandbox:preview:${context.sandboxId}:active`);
      redisMock.get.mockResolvedValueOnce(scriptOptions.args[2]);
      await expect(resolveSandboxPreviewSession(sessionId)).resolves.toEqual(context);
      expect(redisMock.get).toHaveBeenCalledWith(`sandbox:preview:session:${sessionId}`);
    }
  );

  it('rejects creation when the atomic session limit check fails', async () => {
    redisMock.evalScript.mockResolvedValueOnce(0);
    await expect(createSandboxPreviewSession(sessionContext)).rejects.toBeInstanceOf(
      SandboxPreviewSessionLimitError
    );
  });

  it('resolves session context until the Redis TTL expires', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify(sessionContext)).mockResolvedValue(null);

    const sessionId = 'a12345678901234567890123';
    await expect(resolveSandboxPreviewSession(sessionId)).resolves.toEqual(sessionContext);
    await expect(resolveSandboxPreviewSession(sessionId)).rejects.toThrow(
      'Invalid or expired sandbox preview session'
    );
  });

  it.each(['app', 'skilledit'])(
    'resolves legacy %s sessions from their original Redis key',
    async (prefix) => {
      const legacySandboxId = `${prefix}-0123456789abcdef`;
      const context = {
        ...sessionContext,
        sandboxId: legacySandboxId,
        sourceType: prefix === 'app' ? ChatSourceTypeEnum.app : ChatSourceTypeEnum.skillEdit
      };
      const sessionId = 'a12345678901234567890123';
      redisMock.get.mockResolvedValueOnce(JSON.stringify(context)).mockResolvedValue(null);

      await expect(
        resolveSandboxPreviewSession(`${legacySandboxId}:${sessionId}`)
      ).resolves.toEqual(context);
      expect(redisMock.get).toHaveBeenCalledWith(`sandbox:preview:${legacySandboxId}:${sessionId}`);
      await expect(resolveSandboxPreviewSession(`${legacySandboxId}:${sessionId}`)).rejects.toThrow(
        'Invalid or expired sandbox preview session'
      );
      expect(redisMock.get).toHaveBeenCalledTimes(2);
      expect(redisMock.evalScript).not.toHaveBeenCalled();
    }
  );

  it('rejects legacy sessions whose stored sandbox does not match the credential', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify(sessionContext));

    await expect(
      resolveSandboxPreviewSession('app-0123456789abcdef:a12345678901234567890123')
    ).rejects.toThrow('Invalid sandbox preview session');
  });

  it.each([
    '',
    'a1234567890123456789012',
    'a123456789012345678901234',
    'A12345678901234567890123',
    '112345678901234567890123',
    'a1234567890123456789012-',
    'a1234567890123456789012_',
    'a1234567890123456789012é',
    'a1234567890123456789012\n',
    'other-0123456789abcdef:a12345678901234567890123',
    'app-0123456789abcdeG:a12345678901234567890123',
    'app-0123456789abcde:a12345678901234567890123',
    'app-0123456789abcdef0:a12345678901234567890123',
    'app-0123456789abcdef:',
    'app-0123456789abcdef:A12345678901234567890123',
    'app-0123456789abcdef:a1234567890123456789012-',
    'app-0123456789abcdef:a12345678901234567890123:extra'
  ])('rejects malformed preview tokens before querying Redis: %s', async (sessionId) => {
    await expect(resolveSandboxPreviewSession(sessionId)).rejects.toThrow();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('builds a URL from the dedicated preview proxy and encodes each path segment', () => {
    expect(
      buildSandboxPreviewFileUrl({
        sessionId: 'a12345678901234567890123',
        filePath: '/workspace/test dir/预览.html'
      })
    ).toBe(
      'https://agent-preview.example.com:3007/base/preview/a12345678901234567890123/test%20dir/%E9%A2%84%E8%A7%88.html'
    );
  });

  it('requires a dedicated HTTP preview proxy URL', () => {
    Object.assign(serviceEnv, { AGENT_SANDBOX_PREVIEW_PROXY_URL: undefined });

    expect(() =>
      buildSandboxPreviewFileUrl({
        sessionId: 'a12345678901234567890123',
        filePath: '/workspace/index.html'
      })
    ).toThrow('AGENT_SANDBOX_PREVIEW_PROXY_URL environment variable is missing');
  });

  it('normalizes relative and workspace absolute paths', () => {
    expect(resolveSandboxPreviewPath('./dir/file.txt')).toEqual({
      providerPath: '/workspace/dir/file.txt',
      relativePath: 'dir/file.txt'
    });
    expect(resolveSandboxPreviewPath('/workspace/dir/file.txt')).toEqual({
      providerPath: '/workspace/dir/file.txt',
      relativePath: 'dir/file.txt'
    });
  });

  it('rejects workspace roots, traversal, outside absolute paths and noncanonical segments', () => {
    expect(() => resolveSandboxPreviewPath('.')).toThrow('Invalid sandbox preview path');
    expect(() => resolveSandboxPreviewPath('../secret')).toThrow('Path traversal detected');
    expect(() => resolveSandboxPreviewPath('/etc/passwd')).toThrow(
      'Sandbox path is outside workspace'
    );
    expect(() => resolveSandboxPreviewPath('dir//file')).toThrow('Invalid sandbox preview path');
    expect(() => resolveSandboxPreviewPath('dir\\file')).toThrow('Invalid sandbox preview path');
  });
});
