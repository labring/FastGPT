import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';

const runtimeMock = vi.hoisted(() => ({
  getSandboxClient: vi.fn()
}));

const fileServiceMock = vi.hoisted(() => ({
  writeUrlFilesToSandbox: vi.fn()
}));

const s3Mock = vi.hoisted(() => ({
  uploadChatFile: vi.fn(),
  jwtSignS3ObjectKey: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: runtimeMock.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/file', () => ({
  writeUrlFilesToSandbox: fileServiceMock.writeUrlFilesToSandbox
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    uploadChatFile: s3Mock.uploadChatFile
  })
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  jwtSignS3ObjectKey: s3Mock.jwtSignS3ObjectKey
}));

import {
  getSandboxToolInfo,
  injectSandboxFiles,
  runSandboxTools
} from '@fastgpt/service/core/ai/sandbox/toolCall';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0 })),
    provider: {
      readFiles: vi.fn(async () => [{ content: 'a\nb\nc' }])
    }
  }) as any;

describe('sandbox toolCall index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.getSandboxClient.mockResolvedValue(createSandboxInstance());
    s3Mock.uploadChatFile.mockResolvedValue({ key: 'chat/file.txt' });
    s3Mock.jwtSignS3ObjectKey.mockReturnValue('signed-url');
  });

  it('executes known tools through a fetched sandbox client', async () => {
    await expect(
      runSandboxTools({
        appId: 'app',
        userId: 'user',
        chatId: 'chat',
        toolName: SANDBOX_SHELL_TOOL_NAME,
        args: JSON.stringify({ command: 'pwd' })
      })
    ).resolves.toMatchObject({
      success: true,
      input: { command: 'pwd' },
      response: JSON.stringify({ stdout: 'out', stderr: '', exitCode: 0 })
    });

    expect(runtimeMock.getSandboxClient).toHaveBeenCalledWith({
      appId: 'app',
      userId: 'user',
      chatId: 'chat'
    });
  });

  it('reports unknown tools and invalid arguments', async () => {
    const sandbox = createSandboxInstance();

    await expect(
      runSandboxTools({
        appId: 'app',
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
        appId: 'app',
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
        appId: 'app',
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

    await injectSandboxFiles({
      appId: 'app',
      userId: 'user',
      chatId: 'chat',
      files
    });

    expect(sandbox.ensureAvailable).toHaveBeenCalledTimes(1);
    expect(fileServiceMock.writeUrlFilesToSandbox).toHaveBeenCalledWith(sandbox.provider, files);
  });

  it('returns localized tool info for known sandbox tools', () => {
    expect(getSandboxToolInfo(SANDBOX_WRITE_FILE_TOOL_NAME)).toMatchObject({
      avatar: expect.any(String),
      toolDescription: expect.any(String)
    });
    expect(getSandboxToolInfo('missing-tool')).toBeUndefined();
  });
});
