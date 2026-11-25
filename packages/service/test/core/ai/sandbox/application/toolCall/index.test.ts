import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { invalidateIdeAgentPasswordCache } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';

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

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxStaticRuntimePaths: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox',
    skillsRootPath: '/workspace/skills',
    builtinSkillsRootPath: '/var/lib/fastgpt-runtime/skills'
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
    runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    exec: vi.fn(async () => ({ stdout: 'out', stderr: '', exitCode: 0 })),
    getRuntimePaths: vi.fn(() => ({
      workspaceRoot: '/workspace',
      runtimeSkillsRoot: '/workspace/projects',
      sessionWorkDirectory: '/workspace/sessions/chat'
    })),
    resolveRuntimePath: vi.fn((path: string) =>
      path.startsWith('/') ? path : `/workspace/sessions/chat/${path}`
    ),
    opensandbox: {
      createDirectories: vi.fn(async () => undefined),
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
    global.systemInstanceConfig = createDefaultInstanceConfig();
    invalidateIdeAgentPasswordCache();
    runtimeMock.getSandboxClient.mockResolvedValue(createSandboxInstance());
  });

  afterEach(() => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
    invalidateIdeAgentPasswordCache();
  });

  it('executes known tools through a prepared sandbox client without recreating it', async () => {
    const sandboxClient = createSandboxInstance();
    const validate = vi.fn(() => undefined);
    await expect(
      runSandboxTools({
        toolName: SANDBOX_SHELL_TOOL_NAME,
        args: JSON.stringify({ command: 'pwd' }),
        sandboxClient,
        validate
      })
    ).resolves.toMatchObject({
      success: true,
      input: { command: 'pwd' },
      response: 'out'
    });
    expect(validate).toHaveBeenCalledWith({
      toolName: SANDBOX_SHELL_TOOL_NAME,
      args: JSON.stringify({ command: 'pwd' })
    });
    expect(sandboxClient.exec).toHaveBeenCalledWith(expect.stringContaining("/bin/bash -c 'pwd'"));
    expect(sandboxClient.exec.mock.calls[0]?.[0]).not.toContain('python3');
    expect(runtimeMock.getSandboxClient).not.toHaveBeenCalled();
  });

  it('forwards AbortSignal to sandbox client execution', async () => {
    const sandboxClient = createSandboxInstance();
    const controller = new AbortController();

    await expect(
      runSandboxTools({
        toolName: SANDBOX_SHELL_TOOL_NAME,
        args: JSON.stringify({ command: 'sleep 10' }),
        sandboxClient,
        signal: controller.signal
      })
    ).resolves.toMatchObject({ success: true });

    expect(sandboxClient.exec).toHaveBeenCalledWith(
      expect.stringContaining("/bin/bash -c 'sleep 10'"),
      { signal: controller.signal }
    );
  });

  it('returns a validation error without accessing the sandbox', async () => {
    const sandboxClient = createSandboxInstance();

    await expect(
      runSandboxTools({
        toolName: SANDBOX_SHELL_TOOL_NAME,
        args: JSON.stringify({ command: 'cat /private/workflow.json' }),
        sandboxClient,
        validate: () => 'Private workspace access denied.'
      })
    ).resolves.toMatchObject({
      success: false,
      input: {},
      response: 'Private workspace access denied.'
    });
    expect(sandboxClient.exec).not.toHaveBeenCalled();
    expect(sandboxClient.ensureAvailable).not.toHaveBeenCalled();
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
    expect(sandbox.opensandbox.createDirectories).toHaveBeenCalledWith([
      '/workspace/sessions/chat'
    ]);
    expect(mirrorMock.prepareSandboxRuntimeMirrors).toHaveBeenCalledWith({
      sandbox: sandbox.opensandbox
    });
    expect(sandbox.opensandbox.createDirectories.mock.invocationCallOrder[0]).toBeLessThan(
      mirrorMock.prepareSandboxRuntimeMirrors.mock.invocationCallOrder[0]
    );
    expect(mirrorMock.prepareSandboxRuntimeMirrors.mock.invocationCallOrder[0]).toBeLessThan(
      fileApplicationMock.writeUrlFilesToSandbox.mock.invocationCallOrder[0]
    );
    expect(fileApplicationMock.writeUrlFilesToSandbox).toHaveBeenCalledWith({
      sandbox: sandbox.opensandbox,
      files,
      readInputFile: undefined
    });
  });

  it('validates Zod args before probing Docker disk quota', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
      const sandbox = createSandboxInstance();

      const res = await runSandboxTools({
        toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
        args: JSON.stringify({ path: 'a.txt' }),
        sandboxClient: sandbox
      });

      expect(res.success).toBe(false);
      expect(sandbox.runWithRecovery).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('blocks write_file and edit_file with cleanup guidance when docker disk quota is exceeded', async () => {
    const originalFetch = globalThis.fetch;
    try {
      getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
      getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 1;
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ usedBytes: 2 * 1024 * 1024 * 1024 }), { status: 200 })
      ) as unknown as typeof fetch;

      const sandbox = createSandboxInstance();
      sandbox.opensandbox.id = 'sbx-tool-quota';
      sandbox.opensandbox.getEndpoint = vi.fn(async () => ({
        url: '127.0.0.1:1319',
        protocol: 'http',
        headers: {}
      }));
      sandbox.opensandbox.readFiles = vi.fn(async () => [
        { content: Buffer.from('token'), error: null }
      ]);
      sandbox.opensandbox.writeFiles = vi.fn();
      sandbox.opensandbox.replaceContent = vi.fn();

      const writeRes = await runSandboxTools({
        toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
        args: JSON.stringify({ path: 'a.txt', content: 'hello' }),
        sandboxClient: sandbox
      });
      expect(writeRes.success).toBe(false);
      expect(writeRes.response).toContain('Sandbox disk quota exceeded');
      expect(writeRes.response).toContain('sandbox_shell');
      expect(sandbox.opensandbox.writeFiles).not.toHaveBeenCalled();

      const editRes = await runSandboxTools({
        toolName: SANDBOX_EDIT_FILE_TOOL_NAME,
        args: JSON.stringify({ entries: [{ path: 'a.txt', oldContent: 'a', newContent: 'b' }] }),
        sandboxClient: sandbox
      });
      expect(editRes.success).toBe(false);
      expect(editRes.response).toContain('Sandbox disk quota exceeded');
      expect(sandbox.opensandbox.replaceContent).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns cleanup guidance when write_file or edit_file hits ENOSPC on kubernetes', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'kubernetes';
    const sandbox = createSandboxInstance();
    sandbox.opensandbox.writeFiles = vi.fn(async () => [
      { path: 'a.txt', bytesWritten: 0, error: new Error('write failed: no space left on device') }
    ]);
    sandbox.opensandbox.replaceContent = vi.fn(async () => {
      throw Object.assign(new Error('replace failed'), { code: 'ENOSPC' });
    });

    const writeRes = await runSandboxTools({
      toolName: SANDBOX_WRITE_FILE_TOOL_NAME,
      args: JSON.stringify({ path: 'a.txt', content: 'hello' }),
      sandboxClient: sandbox
    });
    expect(writeRes.success).toBe(false);
    expect(writeRes.response).toContain('Sandbox disk space is full');
    expect(writeRes.response).toContain('Do NOT delete files automatically');
    expect(writeRes.response).not.toContain('RLIMIT_FSIZE=0');

    const editRes = await runSandboxTools({
      toolName: SANDBOX_EDIT_FILE_TOOL_NAME,
      args: JSON.stringify({ entries: [{ path: 'a.txt', oldContent: 'a', newContent: 'b' }] }),
      sandboxClient: sandbox
    });
    expect(editRes.success).toBe(false);
    expect(editRes.response).toContain('Sandbox disk space is full');
    expect(editRes.response).not.toContain('RLIMIT_FSIZE=0');
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
