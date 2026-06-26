import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const {
  prepareAgentSandboxRuntimeMock,
  withAgentSandboxInitLeaseMock,
  injectInputFilesToSandboxMock,
  prepareSandboxRuntimeMirrorsMock,
  readSandboxPwdMock,
  runAgentSandboxEntrypointMock,
  resolveSandboxHomeMock,
  injectAgentSkillFilesToSandboxMock,
  syncBuiltinSkillsToSandboxMock,
  runAgentSkillVersionEntrypointsMock,
  getAgentSkillInfosMock,
  sandboxClientMock,
  sandboxProviderMock
} = vi.hoisted(() => ({
  prepareAgentSandboxRuntimeMock: vi.fn(),
  withAgentSandboxInitLeaseMock: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
  injectInputFilesToSandboxMock: vi.fn(),
  prepareSandboxRuntimeMirrorsMock: vi.fn(),
  readSandboxPwdMock: vi.fn(),
  runAgentSandboxEntrypointMock: vi.fn(),
  resolveSandboxHomeMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  syncBuiltinSkillsToSandboxMock: vi.fn(),
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
  runSandboxEntrypoint:
    ({ sandboxEntrypoint }: { sandboxEntrypoint?: string }) =>
    async (context: { sandbox: unknown; workDirectory: string }) => {
      await runAgentSandboxEntrypointMock({
        sandbox: context.sandbox,
        sandboxEntrypoint,
        workDirectory: context.workDirectory
      });
      return context;
    },
  withAgentSandboxInitLease: withAgentSandboxInitLeaseMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/home', () => ({
  resolveSandboxHome: resolveSandboxHomeMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/mirrors', () => ({
  prepareSandboxRuntimeMirrors: prepareSandboxRuntimeMirrorsMock
}));

vi.mock('@fastgpt/service/core/ai/skill/runtime', () => ({
  getAgentSkillInfos: getAgentSkillInfosMock,
  getBuiltinSkillsRootPath: (homeDirectory: string) => `${homeDirectory}/.fastgpt/skills`,
  injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock,
  syncBuiltinSkillsToSandbox: syncBuiltinSkillsToSandboxMock,
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
    const prepareAction = vi.fn(async (context) => ({
      ...context,
      skillScanDirectories: [...context.skillScanDirectories, '/home/sandbox/.fastgpt/skills']
    }));

    const result = await ensureAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      needSandboxRuntime: true,
      sandboxEntrypoint: 'pip install -r requirements.txt',
      skillIds: ['skill_1'],
      prepareActions: [prepareAction],
      currentFiles
    });

    expect(withAgentSandboxInitLeaseMock).toHaveBeenCalledWith({
      sandboxId: 'sandbox_1',
      fn: expect.any(Function)
    });
    expect(injectAgentSkillFilesToSandboxMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      teamId: 'team_1',
      tmbId: 'tmb_1',
      skillIds: ['skill_1'],
      workDirectory: '/workspace'
    });
    expect(prepareSandboxRuntimeMirrorsMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock
    });
    expect(prepareSandboxRuntimeMirrorsMock.mock.invocationCallOrder[0]).toBeLessThan(
      injectAgentSkillFilesToSandboxMock.mock.invocationCallOrder[0]
    );
    expect(prepareSandboxRuntimeMirrorsMock.mock.invocationCallOrder[0]).toBeLessThan(
      runAgentSandboxEntrypointMock.mock.invocationCallOrder[0]
    );
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
    expect(prepareAction).toHaveBeenCalledWith(
      expect.objectContaining({
        deployedSkillVersions: [
          {
            versionId: 'version_1',
            targetDir: '/workspace/skills/version_1'
          }
        ],
        skillScanDirectories: []
      })
    );
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      skillDirectories: ['/workspace/skills/version_1', '/home/sandbox/.fastgpt/skills']
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

  it('runs edit-debug lifecycle without deploying selected skills or builtin skills by default', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');

    await ensureAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'edit_skill_1',
      userId: 'user_1',
      chatId: 'chat_1',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      needSandboxRuntime: true,
      skillIds: [],
      editSkillId: 'edit_skill_1',
      currentFiles
    });

    expect(prepareAgentSandboxRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'edit_skill_1'
      })
    );
    expect(injectInputFilesToSandboxMock).toHaveBeenCalledWith(sandboxProviderMock, currentFiles);
    expect(syncBuiltinSkillsToSandboxMock).not.toHaveBeenCalled();
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      skillDirectories: ['/workspace']
    });
    expect(injectAgentSkillFilesToSandboxMock).not.toHaveBeenCalled();
    expect(runAgentSandboxEntrypointMock).not.toHaveBeenCalled();
    expect(runAgentSkillVersionEntrypointsMock).not.toHaveBeenCalled();
  });

  it('runs custom prepare actions in edit-debug lifecycle', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');
    const prepareAction = vi.fn(async (context) => ({
      ...context,
      skillScanDirectories: [...context.skillScanDirectories, '/home/sandbox/.fastgpt/skills']
    }));

    await ensureAgentSandboxRuntime({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'edit_skill_1',
      userId: 'user_1',
      chatId: 'chat_1',
      teamId: 'team_1',
      needSandboxRuntime: true,
      skillIds: [],
      editSkillId: 'edit_skill_1',
      prepareActions: [prepareAction],
      currentFiles
    });

    expect(prepareSandboxRuntimeMirrorsMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock
    });
    expect(prepareSandboxRuntimeMirrorsMock.mock.invocationCallOrder[0]).toBeLessThan(
      injectInputFilesToSandboxMock.mock.invocationCallOrder[0]
    );
    expect(injectInputFilesToSandboxMock).toHaveBeenCalledWith(sandboxProviderMock, currentFiles);
    expect(syncBuiltinSkillsToSandboxMock).not.toHaveBeenCalled();
    expect(prepareAction).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxClient: sandboxClientMock,
        workDirectory: '/workspace',
        skillScanDirectories: []
      })
    );
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      skillDirectories: ['/workspace', '/home/sandbox/.fastgpt/skills']
    });
    expect(injectAgentSkillFilesToSandboxMock).not.toHaveBeenCalled();
    expect(runAgentSandboxEntrypointMock).not.toHaveBeenCalled();
    expect(runAgentSkillVersionEntrypointsMock).not.toHaveBeenCalled();
  });

  it('creates builtin skill prepare action with lazy source loading', async () => {
    const { createBuiltinSkillPrepareAction } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');
    const builtinSkillSources = [
      {
        name: 'skill-creator',
        files: [
          {
            relativePath: 'SKILL.md',
            content: Buffer.from('# Skill Creator')
          }
        ]
      }
    ];
    const getSources = vi.fn(async () => builtinSkillSources);

    const result = await createBuiltinSkillPrepareAction({ getSources })({
      sandbox: sandboxProviderMock,
      sandboxClient: sandboxClientMock,
      workDirectory: '/workspace',
      deployedSkillVersions: [],
      skillInfos: [],
      skillScanDirectories: []
    });

    expect(getSources).toHaveBeenCalledTimes(1);
    expect(resolveSandboxHomeMock).toHaveBeenCalledWith(sandboxProviderMock);
    expect(syncBuiltinSkillsToSandboxMock).toHaveBeenCalledWith({
      sandbox: sandboxProviderMock,
      homeDirectory: '/home/sandbox',
      sources: builtinSkillSources
    });
    expect(result.skillScanDirectories).toEqual(['/home/sandbox/.fastgpt/skills/skill-creator']);
  });

  it('returns empty skill infos when sandbox runtime is not needed', async () => {
    const { ensureAgentSandboxRuntime } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/sandbox/prepare');

    await expect(
      ensureAgentSandboxRuntime({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app_1',
        userId: 'user_1',
        chatId: 'chat_1',
        teamId: 'team_1',
        tmbId: 'tmb_1',
        needSandboxRuntime: false,
        skillIds: [],
        currentFiles: []
      })
    ).resolves.toEqual({
      skillInfos: []
    });
    expect(prepareAgentSandboxRuntimeMock).not.toHaveBeenCalled();
    expect(withAgentSandboxInitLeaseMock).not.toHaveBeenCalled();
  });
});
