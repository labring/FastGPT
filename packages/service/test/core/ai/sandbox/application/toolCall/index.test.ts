import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';

const runtimeMock = vi.hoisted(() => ({
  getSandboxClient: vi.fn()
}));

const fileApplicationMock = vi.hoisted(() => ({
  writeUrlFilesToSandbox: vi.fn()
}));

const mirrorMock = vi.hoisted(() => ({
  prepareSandboxRuntimeMirrors: vi.fn()
}));

const s3Mock = vi.hoisted(() => ({
  uploadChatFile: vi.fn(),
  createGetChatFileURL: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: runtimeMock.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/file', () => ({
  writeUrlFilesToSandbox: fileApplicationMock.writeUrlFilesToSandbox
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/mirrors', () => ({
  prepareSandboxRuntimeMirrors: mirrorMock.prepareSandboxRuntimeMirrors
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({ workDirectory: '/workspace' })
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    uploadChatFile: s3Mock.uploadChatFile,
    createGetChatFileURL: s3Mock.createGetChatFileURL
  })
}));

import {
  getSandboxToolInfo,
  prepareSandboxToolRuntime,
  runSandboxTools
} from '@fastgpt/service/core/ai/sandbox/application/toolCall';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0 })),
    provider: {
      readFiles: vi.fn(async () => [{ content: 'a\nb\nc' }])
    }
  }) as any;

describe('sandbox toolCall index', () => {
  const appSource = {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.getSandboxClient.mockResolvedValue(createSandboxInstance());
    s3Mock.uploadChatFile.mockResolvedValue({ key: 'chat/file.txt' });
    s3Mock.createGetChatFileURL.mockResolvedValue({ url: 'signed-url' });
  });

  it('executes known tools through a prepared sandbox client', async () => {
    const sandboxClient = createSandboxInstance();
    await expect(
      runSandboxTools({
        toolName: SANDBOX_SHELL_TOOL_NAME,
        args: JSON.stringify({ command: 'pwd' }),
        sandboxClient
      })
    ).resolves.toMatchObject({
      success: true,
      input: { command: 'pwd' },
      response: JSON.stringify({ stdout: 'out', stderr: '', exitCode: 0 })
    });
    expect(runtimeMock.getSandboxClient).not.toHaveBeenCalled();
  });

  it('reports unknown tools and invalid arguments', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      runSandboxTools({
        ...appSource,
        userId: 'user',
        chatId: 'chat',
        toolName: 'unknown-tool',
        args: '{}',
        sandboxClient: sandbox
      })
    ).resolves.toMatchObject({
      success: false,
      response: 'Unknown sandbox tool: unknown-tool'
    });

    await expect(
      runSandboxTools({
        ...appSource,
        userId: 'user',
        chatId: 'chat',
        toolName: SANDBOX_READ_FILE_TOOL_NAME,
        args: JSON.stringify({ path: '/workspace/a.txt', startLine: 3, endLine: 1 }),
        sandboxClient: sandbox
      })
    ).resolves.toMatchObject({
      success: false
    });
  });

  it('reuses a provided sandbox client for valid tools', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      runSandboxTools({
        ...appSource,
        userId: 'user',
        chatId: 'chat',
        toolName: SANDBOX_SHELL_TOOL_NAME,
        args: JSON.stringify({ command: 'pwd' }),
        sandboxClient: sandbox
      })
    ).resolves.toMatchObject({
      success: true
    });

    expect(runtimeMock.getSandboxClient).not.toHaveBeenCalled();
    expect(sandbox.exec).toHaveBeenCalledWith('pwd', undefined);
  });

  it('injects sandbox files into the session sandbox', async () => {
    const sandbox = createSandboxInstance();
    runtimeMock.getSandboxClient.mockResolvedValueOnce(sandbox);
    const files = [{ path: '/workspace/a.txt', url: 'https://example.com/a.txt' }];

    await expect(
      prepareSandboxToolRuntime({
        ...appSource,
        userId: 'user',
        chatId: 'chat',
        files
      })
    ).resolves.toBe(sandbox);

    expect(sandbox.ensureAvailable).not.toHaveBeenCalled();
    expect(mirrorMock.prepareSandboxRuntimeMirrors).toHaveBeenCalledWith({
      sandbox: sandbox.provider
    });
    expect(mirrorMock.prepareSandboxRuntimeMirrors.mock.invocationCallOrder[0]).toBeLessThan(
      fileApplicationMock.writeUrlFilesToSandbox.mock.invocationCallOrder[0]
    );
    expect(fileApplicationMock.writeUrlFilesToSandbox).toHaveBeenCalledWith(
      sandbox.provider,
      files
    );
  });

  it('returns localized tool info for known sandbox tools', () => {
    expect(getSandboxToolInfo(SANDBOX_WRITE_FILE_TOOL_NAME)).toMatchObject({
      avatar: expect.any(String),
      toolDescription: expect.any(String)
    });
    expect(getSandboxToolInfo('missing-tool')).toBeUndefined();
  });
});
