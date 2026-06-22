import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

const {
  getSandboxClientMock,
  checkTeamSandboxPermissionMock,
  pickOutboundAxiosGetMock,
  injectAgentSkillFilesToSandboxMock,
  getAgentSkillInfosMock,
  runAgentSandboxEntrypointMock,
  runAgentSkillVersionEntrypointsMock,
  withAgentSandboxInitLeaseMock,
  sandboxWriteFilesMock,
  sandboxExecMock
} = vi.hoisted(() => ({
  getSandboxClientMock: vi.fn(),
  checkTeamSandboxPermissionMock: vi.fn(),
  pickOutboundAxiosGetMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  getAgentSkillInfosMock: vi.fn(),
  runAgentSandboxEntrypointMock: vi.fn(),
  runAgentSkillVersionEntrypointsMock: vi.fn(),
  withAgentSandboxInitLeaseMock: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  sandboxWriteFilesMock: vi.fn(),
  sandboxExecMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: getSandboxClientMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace'
  })
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: checkTeamSandboxPermissionMock
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  pickOutboundAxios: () => ({
    get: pickOutboundAxiosGetMock
  })
}));

vi.mock('@fastgpt/service/core/ai/skill/runtime', () => ({
  injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock,
  getAgentSkillInfos: getAgentSkillInfosMock
}));

vi.mock('@fastgpt/service/core/ai/skill/runtime/entrypoint', () => ({
  runAgentSandboxEntrypoint: runAgentSandboxEntrypointMock,
  runAgentSkillVersionEntrypoints: runAgentSkillVersionEntrypointsMock,
  withAgentSandboxInitLease: withAgentSandboxInitLeaseMock
}));

describe('ensureAgentSandboxRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkTeamSandboxPermissionMock.mockResolvedValue(undefined);
    pickOutboundAxiosGetMock.mockResolvedValue({ data: new ArrayBuffer(1) });
    sandboxWriteFilesMock.mockResolvedValue(undefined);
    sandboxExecMock.mockResolvedValue({
      exitCode: 0,
      stdout: '/workspace\n',
      stderr: ''
    });
    getSandboxClientMock.mockResolvedValue({
      provider: {
        writeFiles: sandboxWriteFilesMock
      },
      exec: sandboxExecMock,
      getSandboxId: () => 'sandbox_1'
    });
    injectAgentSkillFilesToSandboxMock.mockResolvedValue([
      {
        versionId: 'version_1',
        targetDir: '/workspace/projects/version_1'
      }
    ]);
    getAgentSkillInfosMock.mockResolvedValue([
      {
        id: '/workspace/projects/version_1/SKILL.md',
        name: 'Report',
        description: 'Write reports',
        directory: '/workspace/projects/version_1',
        skillMdPath: '/workspace/projects/version_1/SKILL.md'
      }
    ]);
  });

  it('initializes runtime sandbox once and scans deployed skill directories', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/runtime');
    const sandboxBootstrapMock = vi.fn(async () => undefined);
    let bootstrapReadyBeforeSkillInject = false;
    injectAgentSkillFilesToSandboxMock.mockImplementationOnce(async () => {
      bootstrapReadyBeforeSkillInject = sandboxBootstrapMock.mock.calls.length > 0;
      return [
        {
          versionId: 'version_1',
          targetDir: '/workspace/projects/version_1'
        }
      ];
    });

    const result = await ensureAgentSandboxRuntime({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      teamId: 'team_1',
      needSandboxRuntime: true,
      sandboxBootstrap: sandboxBootstrapMock,
      sandboxEntrypoint: 'pip install -r requirements.txt',
      skillIds: ['skill_1'],
      currentFiles: [
        {
          id: 'file_1',
          name: 'current.pdf',
          type: ChatFileTypeEnum.file,
          url: 'https://files/current.pdf'
        }
      ]
    });

    expect(checkTeamSandboxPermissionMock).toHaveBeenCalledWith('team_1');
    expect(withAgentSandboxInitLeaseMock).toHaveBeenCalledWith({
      sandboxId: 'sandbox_1',
      fn: expect.any(Function)
    });
    expect(sandboxBootstrapMock).toHaveBeenCalledWith({
      sandboxClient: expect.any(Object),
      sandbox: expect.any(Object),
      workDirectory: '/workspace'
    });
    expect(bootstrapReadyBeforeSkillInject).toBe(true);
    expect(injectAgentSkillFilesToSandboxMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      skillIds: ['skill_1'],
      teamId: 'team_1',
      workDirectory: '/workspace'
    });
    expect(sandboxWriteFilesMock).toHaveBeenCalledWith([
      {
        path: 'user_files/current.pdf',
        data: expect.any(ArrayBuffer)
      }
    ]);
    expect(runAgentSandboxEntrypointMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      sandboxEntrypoint: 'pip install -r requirements.txt',
      workDirectory: '/workspace'
    });
    expect(runAgentSkillVersionEntrypointsMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      versions: [{ versionId: 'version_1', targetDir: '/workspace/projects/version_1' }]
    });
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      skillDirectories: ['/workspace/projects/version_1']
    });
    expect(result.currentWorkingDirectory).toBe('/workspace');
    expect(result.skillInfos).toHaveLength(1);
  });
});
