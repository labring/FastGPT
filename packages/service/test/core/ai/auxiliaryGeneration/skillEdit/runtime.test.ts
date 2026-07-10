import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';

const runtimeMocks = vi.hoisted(() => ({
  prepareAgentSandboxRuntime: vi.fn(),
  preparePackageMirrors: vi.fn(),
  prepareSandbox: vi.fn(),
  readCurrentWorkingDirectory: vi.fn(),
  withAgentSandboxInitLease: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => {
    runtimeMocks.leaseActive = true;
    try {
      return await fn();
    } finally {
      runtimeMocks.leaseActive = false;
    }
  }),
  getAgentSkillInfos: vi.fn(),
  skillScanInsideLease: false,
  leaseActive: false,
  sandboxProvider: {},
  sandboxClient: {
    provider: {},
    getSandboxId: vi.fn(() => 'sandbox-id')
  }
}));

runtimeMocks.sandboxClient.provider = runtimeMocks.sandboxProvider;

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  prepareAgentSandboxRuntime: runtimeMocks.prepareAgentSandboxRuntime,
  preparePackageMirrors: runtimeMocks.preparePackageMirrors,
  prepareSandbox: runtimeMocks.prepareSandbox,
  readCurrentWorkingDirectory: runtimeMocks.readCurrentWorkingDirectory,
  withAgentSandboxInitLease: runtimeMocks.withAgentSandboxInitLease,
  getAgentSkillInfos: runtimeMocks.getAgentSkillInfos
}));

import { prepareSkillEditRuntime } from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/runtime';

describe('prepareSkillEditRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.skillScanInsideLease = false;
    runtimeMocks.leaseActive = false;
    runtimeMocks.prepareAgentSandboxRuntime.mockResolvedValue({
      sandboxClient: runtimeMocks.sandboxClient,
      workDirectory: '/workspace'
    });
    runtimeMocks.preparePackageMirrors.mockReturnValue(async (context: any) => ({
      ...context,
      mirrorsPrepared: true
    }));
    runtimeMocks.readCurrentWorkingDirectory.mockReturnValue(async (context: any) => ({
      ...context,
      currentWorkingDirectory: '/workspace'
    }));
    runtimeMocks.prepareSandbox.mockImplementation(async (context: any, ...steps: any[]) => {
      let nextContext = context;
      for (const step of steps) {
        nextContext = await step(nextContext);
      }
      return nextContext;
    });
    runtimeMocks.getAgentSkillInfos.mockImplementation(async () => {
      runtimeMocks.skillScanInsideLease = runtimeMocks.leaseActive;
      return [
        {
          name: 'skill',
          description: 'description',
          directory: '/workspace/skills/skill',
          skillMdPath: '/workspace/skills/skill/SKILL.md'
        }
      ];
    });
  });

  it('prepares edit sandbox inside init lease and scans prepared skill directories', async () => {
    const prepareAction = vi.fn(async (context: any) => ({
      ...context,
      skillScanDirectories: [...context.skillScanDirectories, '/home/sandbox/.fastgpt/skills']
    }));

    const result = await prepareSkillEditRuntime({
      skillId: 'skill-id',
      userId: 'user-id',
      teamId: 'team-id',
      prepareActions: [prepareAction]
    });

    expect(runtimeMocks.prepareAgentSandboxRuntime).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-id',
      userId: 'user-id',
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      teamId: 'team-id'
    });
    expect(runtimeMocks.withAgentSandboxInitLease).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      fn: expect.any(Function)
    });
    const [sandboxPrepareContext, ...prepareSteps] = runtimeMocks.prepareSandbox.mock.calls[0];
    expect(sandboxPrepareContext).toEqual(
      expect.objectContaining({
        sandboxClient: runtimeMocks.sandboxClient,
        sandbox: runtimeMocks.sandboxProvider,
        skillScanDirectories: []
      })
    );
    expect(prepareSteps).toContain(prepareAction);
    expect(runtimeMocks.getAgentSkillInfos).toHaveBeenCalledWith({
      sandbox: runtimeMocks.sandboxProvider,
      skillDirectories: ['/workspace', '/home/sandbox/.fastgpt/skills']
    });
    expect(runtimeMocks.skillScanInsideLease).toBe(true);
    expect(result).toEqual({
      sandboxClient: runtimeMocks.sandboxClient,
      currentWorkingDirectory: '/workspace',
      skillInfos: [
        {
          name: 'skill',
          description: 'description',
          directory: '/workspace/skills/skill',
          skillMdPath: '/workspace/skills/skill/SKILL.md'
        }
      ]
    });
  });
});
