import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

const {
  prepareAgentSandboxRuntimeMock,
  withAgentSandboxInitLeaseMock,
  injectInputFilesToSandboxMock,
  readSandboxPwdMock,
  runAgentSandboxEntrypointMock,
  resolveSandboxHomeMock,
  injectAgentSkillFilesToSandboxMock,
  injectEditDebugBuiltinSkillsToSandboxMock,
  runAgentSkillVersionEntrypointsMock,
  getAgentSkillInfosMock,
  sandboxClientMock,
  sandboxProviderMock
} = vi.hoisted(() => ({
  prepareAgentSandboxRuntimeMock: vi.fn(),
  withAgentSandboxInitLeaseMock: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  injectInputFilesToSandboxMock: vi.fn(),
  readSandboxPwdMock: vi.fn(),
  runAgentSandboxEntrypointMock: vi.fn(),
  resolveSandboxHomeMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  injectEditDebugBuiltinSkillsToSandboxMock: vi.fn(),
  runAgentSkillVersionEntrypointsMock: vi.fn(),
  getAgentSkillInfosMock: vi.fn(),
  sandboxProviderMock: {},
  sandboxClientMock: {
    provider: {},
    getSandboxId: vi.fn(() => 'sandbox_1')
  }
}));

sandboxClientMock.provider = sandboxProviderMock;

vi.mock('@fastgpt/service/core/ai/sandbox/runtime', () => ({
  prepareAgentSandboxRuntime: prepareAgentSandboxRuntimeMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/files', () => ({
  injectInputFilesToSandbox: injectInputFilesToSandboxMock,
  readSandboxPwd: readSandboxPwdMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/entrypoint', () => ({
  runAgentSandboxEntrypoint: runAgentSandboxEntrypointMock,
  withAgentSandboxInitLease: withAgentSandboxInitLeaseMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/home', () => ({
  resolveSandboxHome: resolveSandboxHomeMock
}));

vi.mock('@fastgpt/service/core/ai/skill/runtime', () => ({
  getAgentSkillInfos: getAgentSkillInfosMock,
  getBuiltinSkillsRootPath: (homeDirectory: string) => `${homeDirectory}/.fastgpt/skills`,
  injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock,
  injectEditDebugBuiltinSkillsToSandbox: injectEditDebugBuiltinSkillsToSandboxMock,
  runAgentSkillVersionEntrypoints: runAgentSkillVersionEntrypointsMock
}));

const currentFiles = [
  {
    id: 'file_1',
    name: 'current.pdf',
    type: ChatFileTypeEnum.file,
    url: 'https://files/current.pdf'
  }
];

describe('ensureAgentSandboxRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareAgentSandboxRuntimeMock.mockResolvedValue({
      sandboxClient: sandboxClientMock,
      workDirectory: '/workspace'
    });
    readSandboxPwdMock.mockResolvedValue('/workspace');
    resolveSandboxHomeMock.mockResolvedValue('/home/sandbox');
    injectAgentSkillFilesToSandboxMock.mockResolvedValue([
      {
        versionId: 'version_1',
        targetDir: '/workspace/skills/version_1'
      }
    ]);
    getAgentSkillInfosMock.mockResolvedValue([
      {
        id: '/workspace/skills/version_1/Report/SKILL.md',
        name: 'Report',
        description: 'Write reports',
        directory: '/workspace/skills/version_1/Report',
        skillMdPath: '/workspace/skills/version_1/Report/SKILL.md'
      }
    ]);
  });

  it('runs selected skill lifecycle inside sandbox init lease', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');

    const result = await ensureAgentSandboxRuntime({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      teamId: 'team_1',
      needSandboxRuntime: true,
      sandboxEntrypoint: 'pip install -r requirements.txt',
      skillIds: ['skill_1'],
      currentFiles
    });

    expect(withAgentSandboxInitLeaseMock).toHaveBeenCalledWith({
      sandboxId: 'sandbox_1',
      fn: expect.any(Function)
    });
    expect(injectAgentSkillFilesToSandboxMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      teamId: 'team_1',
      skillIds: ['skill_1'],
      workDirectory: '/workspace'
    });
    expect(injectInputFilesToSandboxMock).toHaveBeenCalledWith(sandboxProviderMock, currentFiles);
    expect(readSandboxPwdMock).toHaveBeenCalledWith(sandboxClientMock);
    expect(runAgentSandboxEntrypointMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      sandboxEntrypoint: 'pip install -r requirements.txt',
      workDirectory: '/workspace'
    });
    expect(runAgentSkillVersionEntrypointsMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      versions: [
        {
          versionId: 'version_1',
          targetDir: '/workspace/skills/version_1'
        }
      ]
    });
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      skillDirectories: ['/workspace/skills/version_1']
    });
    expect(result).toEqual({
      sandboxClient: sandboxClientMock,
      currentWorkingDirectory: '/workspace',
      skillInfos: [
        {
          id: '/workspace/skills/version_1/Report/SKILL.md',
          name: 'Report',
          description: 'Write reports',
          directory: '/workspace/skills/version_1/Report',
          skillMdPath: '/workspace/skills/version_1/Report/SKILL.md'
        }
      ]
    });
  });

  it('runs edit-debug lifecycle without deploying selected skills', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');

    await ensureAgentSandboxRuntime({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      teamId: 'team_1',
      needSandboxRuntime: true,
      skillIds: [],
      editSkillId: 'edit_skill_1',
      currentFiles
    });

    expect(injectInputFilesToSandboxMock).toHaveBeenCalledWith(sandboxProviderMock, currentFiles);
    expect(injectEditDebugBuiltinSkillsToSandboxMock).toHaveBeenCalledWith(sandboxProviderMock);
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      skillDirectories: ['/workspace', '/home/sandbox/.fastgpt/skills']
    });
    expect(injectAgentSkillFilesToSandboxMock).not.toHaveBeenCalled();
    expect(runAgentSandboxEntrypointMock).not.toHaveBeenCalled();
    expect(runAgentSkillVersionEntrypointsMock).not.toHaveBeenCalled();
  });

  it('returns empty skill infos when sandbox runtime is not needed', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');
    prepareAgentSandboxRuntimeMock.mockResolvedValueOnce(undefined);

    await expect(
      ensureAgentSandboxRuntime({
        appId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        teamId: 'team_1',
        needSandboxRuntime: false,
        skillIds: [],
        currentFiles: []
      })
    ).resolves.toEqual({
      skillInfos: []
    });
    expect(withAgentSandboxInitLeaseMock).not.toHaveBeenCalled();
  });
});
