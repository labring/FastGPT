import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createVersion: vi.fn(),
  findSandboxInstanceBySandboxIdAndSource: vi.fn(),
  mongoAgentSkillsUpdateOne: vi.fn(),
  mongoSessionRun: vi.fn(async (fn: (session: unknown) => Promise<unknown>) =>
    fn({ id: 'mock-session' })
  ),
  packageSkillInSandbox: vi.fn(),
  removeSkillPackageTTL: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn(),
  updateCurrentVersion: vi.fn(),
  uploadSkillPackage: vi.fn(),
  validateZipStructure: vi.fn(),
  extractRuntimeSkillsFromPackage: vi.fn()
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

vi.mock('@fastgpt/service/core/ai/skill/manage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/manage')>();
  return {
    ...actual,
    updateCurrentVersion: mocks.updateCurrentVersion
  };
});

vi.mock('@fastgpt/service/core/ai/skill/package', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/package')>();
  return {
    ...actual,
    extractRuntimeSkillsFromPackage: mocks.extractRuntimeSkillsFromPackage,
    removeSkillPackageTTL: mocks.removeSkillPackageTTL,
    uploadSkillPackage: mocks.uploadSkillPackage,
    validateZipStructure: mocks.validateZipStructure
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime', () => ({
  packageSkillInSandbox: mocks.packageSkillInSandbox
}));

vi.mock('@fastgpt/service/core/ai/skill/version', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/version')>();
  return {
    ...actual,
    createVersion: mocks.createVersion
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getSandboxProviderConfig: () => ({
    provider: 'test-provider'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findSandboxInstanceBySandboxIdAndSource: mocks.findSandboxInstanceBySandboxIdAndSource,
  updateSandboxInstanceRecordBySandboxId: mocks.updateSandboxInstanceRecordBySandboxId
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/skill/model/schema')>();
  return {
    ...actual,
    MongoAgentSkills: {
      updateOne: mocks.mongoAgentSkillsUpdateOne
    }
  };
});

import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { saveDeploySkillFromSandbox } from '@fastgpt/service/core/ai/sandbox/application/skillEdit/deploy';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';

describe('saveDeploySkillFromSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValue({
      sandboxId: 'sandbox-1',
      status: SandboxStatusEnum.running,
      metadata: {
        teamId: 'team-1'
      }
    });
    mocks.packageSkillInSandbox.mockResolvedValue(Buffer.from('mock zip'));
    mocks.validateZipStructure.mockResolvedValue({ valid: true });
    mocks.extractRuntimeSkillsFromPackage.mockResolvedValue([
      {
        name: 'runtime-skill',
        description: 'Runtime skill',
        path: 'skills/runtime-skill/SKILL.md'
      }
    ]);
    mocks.uploadSkillPackage.mockResolvedValue({
      key: 'agent-skills/team-1/skill-1/version-1.zip'
    });
    mocks.updateCurrentVersion.mockResolvedValue(true);
    mocks.createVersion.mockResolvedValue('version-1');
    mocks.mongoAgentSkillsUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.removeSkillPackageTTL.mockResolvedValue(undefined);
    mocks.updateSandboxInstanceRecordBySandboxId.mockResolvedValue({
      sandboxId: 'sandbox-1'
    });
  });

  it('keeps the uploaded package TTL when the skill was deleted before version linking', async () => {
    mocks.updateCurrentVersion.mockResolvedValueOnce(false);

    await expect(
      saveDeploySkillFromSandbox({
        skillId: 'skill-1',
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow('Skill not found');

    expect(mocks.uploadSkillPackage).toHaveBeenCalled();
    expect(mocks.findSandboxInstanceBySandboxIdAndSource).toHaveBeenCalledWith({
      provider: 'test-provider',
      sandboxId: getEditDebugSandboxId('skill-1'),
      sourceType: 'skillEdit',
      sourceId: 'skill-1',
      status: SandboxStatusEnum.running
    });
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(mocks.mongoAgentSkillsUpdateOne).not.toHaveBeenCalled();
    expect(mocks.removeSkillPackageTTL).not.toHaveBeenCalled();
  });

  it('touches the sandbox version metadata after deploy only when archive state has not changed', async () => {
    await expect(
      saveDeploySkillFromSandbox({
        skillId: 'skill-1',
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).resolves.toMatchObject({
      skillId: 'skill-1',
      storageKey: 'agent-skills/team-1/skill-1/version-1.zip'
    });

    expect(mocks.updateSandboxInstanceRecordBySandboxId).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'test-provider',
        sandboxId: 'sandbox-1',
        sourceType: 'skillEdit',
        sourceId: 'skill-1',
        touchActive: true,
        metadata: expect.objectContaining({
          teamId: 'team-1'
        })
      })
    );
    expect(mocks.updateCurrentVersion).toHaveBeenCalledWith({
      skillId: 'skill-1',
      currentVersionId: expect.any(String),
      runtimeSkills: [
        {
          name: 'runtime-skill',
          description: 'Runtime skill',
          path: 'skills/runtime-skill/SKILL.md'
        }
      ],
      session: { id: 'mock-session' }
    });
    expect(mocks.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSkills: [
          {
            name: 'runtime-skill',
            description: 'Runtime skill',
            path: 'skills/runtime-skill/SKILL.md'
          }
        ]
      }),
      { id: 'mock-session' }
    );
  });

  it('rejects sandbox records that do not belong to the deploying team', async () => {
    mocks.findSandboxInstanceBySandboxIdAndSource.mockResolvedValueOnce({
      sandboxId: 'sandbox-1',
      status: SandboxStatusEnum.running,
      metadata: {
        teamId: 'team-other'
      }
    });

    await expect(
      saveDeploySkillFromSandbox({
        skillId: 'skill-1',
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow('Edit sandbox not found or not running');

    expect(mocks.packageSkillInSandbox).not.toHaveBeenCalled();
    expect(mocks.uploadSkillPackage).not.toHaveBeenCalled();
  });
});
