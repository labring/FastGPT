import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
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
  resolveSandboxPreviewFiles,
  resolveSandboxPreviewSession,
  SandboxPreviewFileNotFoundError,
  SandboxPreviewPathAccessError,
  SandboxPreviewSessionLimitError
} from '@fastgpt/service/core/ai/sandbox/application/preview';
import { resolveSandboxRuntimePath } from '@fastgpt/service/core/ai/sandbox/utils';
import {
  SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX,
  SANDBOX_PREVIEW_SESSION_TTL_SECONDS
} from '@fastgpt/service/core/ai/sandbox/constants';

const originalEnv = {
  AGENT_SANDBOX_PROXY_URL: serviceEnv.AGENT_SANDBOX_PROXY_URL,
  AGENT_SANDBOX_PREVIEW_PROXY_URL: serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  FE_DOMAIN: serviceEnv.FE_DOMAIN
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

const createMockSandbox = (fileInfoEntries: Array<[string, { type?: string }]> = []) =>
  ({
    resolveRuntimePath: (inputPath: string, options?: { allowAbsolutePath?: boolean }) =>
      resolveSandboxRuntimePath(
        inputPath,
        { sessionWorkDirectory: '/workspace/sessions/chat-1' },
        options
      ),
    opensandbox: {
      getFileInfo: vi.fn(async () => new Map(fileInfoEntries))
    }
  }) as any;

describe('sandbox preview application', () => {
  beforeEach(() => {
    Object.assign(serviceEnv, {
      AGENT_SANDBOX_PROXY_URL: 'ws://localhost:1006',
      AGENT_SANDBOX_PREVIEW_PROXY_URL: 'https://agent-preview.example.com:3007/base/',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
      FE_DOMAIN: 'https://app.example.com'
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
        relativePath: 'dist/index.html'
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
      SandboxErrEnum.agentSandboxPermissionDenied
    );
  });

  it('resolves allowed workspace files and rejects outside-workspace, traversal, and missing files', async () => {
    const sandbox = createMockSandbox([
      ['/workspace/dist/index.html', { type: 'file' }],
      ['/workspace/sessions/chat-1/dist/index.html', { type: 'file' }],
      ['/workspace/sessions/chat-2/dist/index.html', { type: 'file' }],
      ['/workspace/sessions/chat-1/dir', { type: 'directory' }]
    ]);

    await expect(
      resolveSandboxPreviewFiles({
        sandbox,
        paths: [
          '/workspace/dist/index.html',
          'dist/index.html',
          '/workspace/sessions/chat-2/dist/index.html'
        ]
      })
    ).resolves.toEqual([
      { providerPath: '/workspace/dist/index.html', relativePath: 'dist/index.html' },
      {
        providerPath: '/workspace/sessions/chat-1/dist/index.html',
        relativePath: 'sessions/chat-1/dist/index.html'
      },
      {
        providerPath: '/workspace/sessions/chat-2/dist/index.html',
        relativePath: 'sessions/chat-2/dist/index.html'
      }
    ]);

    for (const forbidden of [
      '/etc/passwd',
      '../../../etc/passwd',
      '/workspace',
      '/workspace/.fastgpt/bun/bin/bun',
      'dir\\file.txt'
    ]) {
      await expect(
        resolveSandboxPreviewFiles({
          sandbox,
          paths: [forbidden]
        })
      ).rejects.toBeInstanceOf(SandboxPreviewPathAccessError);
    }

    for (const notFile of ['missing.txt', 'dir']) {
      await expect(
        resolveSandboxPreviewFiles({
          sandbox,
          paths: [notFile]
        })
      ).rejects.toBeInstanceOf(SandboxPreviewFileNotFoundError);
    }
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
    'app-0123456789abcdef:a12345678901234567890123'
  ])('rejects malformed preview tokens before querying Redis: %s', async (sessionId) => {
    await expect(resolveSandboxPreviewSession(sessionId)).rejects.toThrow();
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('falls back to AGENT_SANDBOX_PROXY_URL when AGENT_SANDBOX_PREVIEW_PROXY_URL is unset', () => {
    Object.assign(serviceEnv, {
      AGENT_SANDBOX_PREVIEW_PROXY_URL: undefined,
      AGENT_SANDBOX_PROXY_URL: 'ws://localhost:1006/terminal'
    });

    expect(
      buildSandboxPreviewFileUrl({
        sessionId: 'a12345678901234567890123',
        relativePath: 'test dir/预览.html'
      })
    ).toBe(
      'http://localhost:1006/preview/a12345678901234567890123/test%20dir/%E9%A2%84%E8%A7%88.html'
    );
  });

  it('throws when both AGENT_SANDBOX_PREVIEW_PROXY_URL and AGENT_SANDBOX_PROXY_URL are missing', () => {
    Object.assign(serviceEnv, {
      AGENT_SANDBOX_PREVIEW_PROXY_URL: undefined,
      AGENT_SANDBOX_PROXY_URL: undefined
    });

    expect(() =>
      buildSandboxPreviewFileUrl({
        sessionId: 'a12345678901234567890123',
        relativePath: 'index.html'
      })
    ).toThrow(
      'AGENT_SANDBOX_PREVIEW_PROXY_URL or AGENT_SANDBOX_PROXY_URL environment variable is missing'
    );
  });
});
