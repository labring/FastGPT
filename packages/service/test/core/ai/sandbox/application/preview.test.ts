import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { serviceEnv } from '@fastgpt/service/env';

vi.mock('@fastgpt/service/common/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/redis')>()),
  getAllKeysByPrefix: vi.fn(),
  getGlobalRedisConnection: vi.fn()
}));

import { getAllKeysByPrefix, getGlobalRedisConnection } from '@fastgpt/service/common/redis';

import {
  buildSandboxPreviewFileUrl,
  createSandboxPreviewSession,
  resolveSandboxPreviewPath,
  resolveSandboxPreviewSession,
  SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX,
  SANDBOX_PREVIEW_SESSION_TTL_SECONDS,
  SandboxPreviewSessionLimitError
} from '@fastgpt/service/core/ai/sandbox/application/preview';

const originalProxyUrl = serviceEnv.AGENT_SANDBOX_PROXY_URL;
const originalPreviewProxyUrl = serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL;
const originalProvider = serviceEnv.AGENT_SANDBOX_PROVIDER;
const redisMock = {
  set: vi.fn(),
  get: vi.fn()
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
    serviceEnv.AGENT_SANDBOX_PROXY_URL = 'wss://agent-proxy.example.com/base/';
    serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = 'https://agent-preview.example.com:3007/base/';
    serviceEnv.AGENT_SANDBOX_PROVIDER = 'opensandbox';
    vi.resetAllMocks();
    vi.mocked(getAllKeysByPrefix).mockResolvedValue([]);
    redisMock.set.mockResolvedValue('OK');
    vi.mocked(getGlobalRedisConnection).mockReturnValue(redisMock as any);
  });

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_PROXY_URL = originalProxyUrl;
    serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = originalPreviewProxyUrl;
    serviceEnv.AGENT_SANDBOX_PROVIDER = originalProvider;
  });

  it('checks the sandbox limit before creating a 24-character session', async () => {
    const sessionId = await createSandboxPreviewSession(sessionContext);

    expect(sessionId).toMatch(/^[a-z][a-zA-Z0-9]{23}$/);
    expect(getAllKeysByPrefix).toHaveBeenCalledWith(`sandbox:preview:${sandboxId}`);
    const [sessionKey, payload, expiryMode, ttl] = redisMock.set.mock.calls[0];
    expect(sessionKey).toMatch(/^sandbox:preview:app-[a-f0-9]{16}:[a-z][a-zA-Z0-9]{23}$/);
    expect(JSON.parse(String(payload))).toEqual(sessionContext);
    expect(expiryMode).toBe('EX');
    expect(ttl).toBe(SANDBOX_PREVIEW_SESSION_TTL_SECONDS);
  });

  it('rejects creation at 500 active sessions without deleting old sessions', async () => {
    vi.mocked(getAllKeysByPrefix).mockResolvedValueOnce(
      Array.from({ length: SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX }, (_, index) => String(index))
    );
    await expect(createSandboxPreviewSession(sessionContext)).rejects.toBeInstanceOf(
      SandboxPreviewSessionLimitError
    );
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('resolves session context until the Redis TTL expires', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify(sessionContext)).mockResolvedValue(null);

    const credential = `${sandboxId}:a12345678901234567890123`;
    await expect(resolveSandboxPreviewSession(credential)).resolves.toEqual(sessionContext);
    await expect(resolveSandboxPreviewSession(credential)).rejects.toThrow(
      'Invalid or expired sandbox preview session'
    );
    await expect(resolveSandboxPreviewSession('invalid')).rejects.toThrow();
  });

  it('builds a URL from the dedicated preview proxy and encodes each path segment', () => {
    expect(
      buildSandboxPreviewFileUrl({
        sandboxId,
        sessionId: 'a12345678901234567890123',
        filePath: '/workspace/test dir/预览.html'
      })
    ).toBe(
      `https://agent-preview.example.com:3007/base/preview/${sandboxId}/a12345678901234567890123/test%20dir/%E9%A2%84%E8%A7%88.html`
    );
  });

  it('requires a dedicated HTTP preview proxy URL', () => {
    serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL = undefined;

    expect(() =>
      buildSandboxPreviewFileUrl({
        sandboxId,
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
