import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const runtimeMock = vi.hoisted(() => ({
  getSandboxClient: vi.fn()
}));

const fileApplicationMock = vi.hoisted(() => ({
  writeUrlFilesToSandbox: vi.fn()
}));

const mirrorMock = vi.hoisted(() => ({
  prepareSandboxRuntimeMirrors: vi.fn()
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

import {
  getSandboxToolInfo,
  prepareSandboxToolRuntime,
  runSandboxTools
} from '@fastgpt/service/core/ai/sandbox/application/toolCall';

const createSandboxInstance = () =>
  ({
    ensureAvailable: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0 })),
    getRuntimePaths: vi.fn(() => ({
      workspaceRoot: '/workspace',
      runtimeSkillsRoot: '/workspace/projects',
      sessionWorkDirectory: '/workspace/sessions/chat'
    })),
    resolveRuntimePath: vi.fn((path: string) =>
      path.startsWith('/') ? path : `/workspace/sessions/chat/${path}`
    ),
    provider: {
      readFiles: vi.fn(async () => [{ content: 'a\nb\nc' }]),
      deleteFiles: vi.fn(async () => [])
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
      response: 'out'
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
        args: JSON.stringify({ path: '/workspace/a.txt', offset: 0 }),
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
    expect(sandbox.exec).toHaveBeenCalledWith(
      expect.stringMatching(/^\/bin\/bash -c 'pwd' > '\/tmp\/fastgpt-bash-[^']+\.log' 2>&1/),
      undefined
    );
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
    expect(getSandboxToolInfo(SANDBOX_SHELL_TOOL_NAME, 'zh-CN')).toMatchObject({
      name: '虚拟机/执行命令',
      avatar: expect.any(String),
      toolDescription: expect.any(String)
    });
    expect(getSandboxToolInfo(SANDBOX_WRITE_FILE_TOOL_NAME)).toMatchObject({
      avatar: expect.any(String),
      toolDescription: expect.any(String)
    });
    expect(getSandboxToolInfo('missing-tool')).toBeUndefined();
  });
});
