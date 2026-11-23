import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createVersion: vi.fn(),
  getRunningSkillEditSandbox: vi.fn(),
  mongoAgentSkillsUpdateOne: vi.fn(),
  mongoSessionRun: vi.fn(async (fn: (session: unknown) => Promise<unknown>) =>
    fn({ id: 'mock-session' })
  ),
  packageSkillInSandbox: vi.fn(),
  removeSkillPackageTTL: vi.fn(),
  updateSandboxInstanceRecordBySandboxId: vi.fn(),
  updateCurrentVersion: vi.fn(),
  uploadSkillPackage: vi.fn(),
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
    uploadSkillPackage: mocks.uploadSkillPackage
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime', () => ({
  getRunningSkillEditSandbox: mocks.getRunningSkillEditSandbox,
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

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
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

import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { saveDeploySkillFromSandbox } from '@fastgpt/service/core/ai/sandbox/application/skillEdit/deploy';

describe('saveDeploySkillFromSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getRunningSkillEditSandbox.mockResolvedValue({
      provider: 'test-provider',
      sandboxId: 'sandbox-1',
      teamId: 'team-1'
    });
    mocks.packageSkillInSandbox.mockResolvedValue(Buffer.from('mock zip'));
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
    ).rejects.toThrow(SkillErrEnum.unExist);

    expect(mocks.uploadSkillPackage).toHaveBeenCalled();
    expect(mocks.getRunningSkillEditSandbox).toHaveBeenCalledWith({
      skillId: 'skill-1',
      teamId: 'team-1'
    });
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(mocks.mongoAgentSkillsUpdateOne).not.toHaveBeenCalled();
    expect(mocks.removeSkillPackageTTL).not.toHaveBeenCalled();
  });

  it('touches the sandbox versionId after deploy only when archive state has not changed', async () => {
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
        userId: 'skillEdit',
        touchActive: true,
        versionId: expect.any(String)
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

  it('rejects when no running edit sandbox exists for the deploying team', async () => {
    mocks.getRunningSkillEditSandbox.mockResolvedValueOnce(undefined);

    await expect(
      saveDeploySkillFromSandbox({
        skillId: 'skill-1',
        teamId: 'team-1',
        tmbId: 'tmb-1'
      })
    ).rejects.toThrow(SkillErrEnum.editSandboxNotRunning);

    expect(mocks.packageSkillInSandbox).not.toHaveBeenCalled();
    expect(mocks.uploadSkillPackage).not.toHaveBeenCalled();
  });

  it('rethrows UserError and maps unexpected failures to non-UserError deployFailed', async () => {
    mocks.packageSkillInSandbox.mockRejectedValueOnce(new UserError(SkillErrEnum.missingSkillMd));
    await expect(
      saveDeploySkillFromSandbox({ skillId: 'skill-1', teamId: 'team-1', tmbId: 'tmb-1' })
    ).rejects.toThrow(SkillErrEnum.missingSkillMd);

    mocks.packageSkillInSandbox.mockRejectedValueOnce(new Error('zip exited with 12'));
    const packageErr = await saveDeploySkillFromSandbox({
      skillId: 'skill-1',
      teamId: 'team-1',
      tmbId: 'tmb-1'
    }).catch((err) => err);
    expect(packageErr).toBeInstanceOf(Error);
    expect(packageErr).not.toBeInstanceOf(UserError);
    expect(packageErr.message).toBe(SkillErrEnum.deployFailed);

    mocks.uploadSkillPackage.mockRejectedValueOnce(new UserError(SkillErrEnum.archiveTooLarge));
    await expect(
      saveDeploySkillFromSandbox({ skillId: 'skill-1', teamId: 'team-1', tmbId: 'tmb-1' })
    ).rejects.toThrow(SkillErrEnum.archiveTooLarge);

    mocks.uploadSkillPackage.mockRejectedValueOnce(new Error('S3 timeout'));
    const uploadErr = await saveDeploySkillFromSandbox({
      skillId: 'skill-1',
      teamId: 'team-1',
      tmbId: 'tmb-1'
    }).catch((err) => err);
    expect(uploadErr).toBeInstanceOf(Error);
    expect(uploadErr).not.toBeInstanceOf(UserError);
    expect(uploadErr.message).toBe(SkillErrEnum.deployFailed);
  });
});
