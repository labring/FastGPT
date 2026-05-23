import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createVersion: vi.fn(),
  findSandboxInstanceByAppChatType: vi.fn(),
  mongoAgentSkillsUpdateOne: vi.fn(),
  mongoSessionRun: vi.fn(async (fn: (session: unknown) => Promise<unknown>) =>
    fn({ id: 'mock-session' })
  ),
  packageSkillInSandbox: vi.fn(),
  removeSkillPackageTTL: vi.fn(),
  updateCurrentVersion: vi.fn(),
  uploadSkillPackage: vi.fn(),
  validateZipStructure: vi.fn()
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
    removeSkillPackageTTL: mocks.removeSkillPackageTTL,
    uploadSkillPackage: mocks.uploadSkillPackage,
    validateZipStructure: mocks.validateZipStructure
  };
});

vi.mock('@fastgpt/service/core/ai/skill/edit/sandbox', () => ({
  packageSkillInSandbox: mocks.packageSkillInSandbox
}));

vi.mock('@fastgpt/service/core/ai/skill/version', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/version')>();
  return {
    ...actual,
    createVersion: mocks.createVersion
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    skillsRootPath: '/workspace/skills'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/config', () => ({
  getSandboxProviderConfig: () => ({
    provider: 'test-provider'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  findSandboxInstanceByAppChatType: mocks.findSandboxInstanceByAppChatType
}));

vi.mock('@fastgpt/service/core/ai/skill/model/schema', () => ({
  MongoAgentSkills: {
    updateOne: mocks.mongoAgentSkillsUpdateOne
  }
}));

import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { saveDeploySkillFromSandbox } from '@fastgpt/service/core/ai/skill/edit/deploy';

describe('saveDeploySkillFromSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findSandboxInstanceByAppChatType.mockResolvedValue({
      sandboxId: 'sandbox-1',
      status: SandboxStatusEnum.running
    });
    mocks.packageSkillInSandbox.mockResolvedValue(Buffer.from('mock zip'));
    mocks.validateZipStructure.mockResolvedValue({ valid: true });
    mocks.uploadSkillPackage.mockResolvedValue({
      key: 'agent-skills/team-1/skill-1/version-1.zip'
    });
    mocks.updateCurrentVersion.mockResolvedValue(true);
    mocks.createVersion.mockResolvedValue('version-1');
    mocks.mongoAgentSkillsUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.removeSkillPackageTTL.mockResolvedValue(undefined);
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
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(mocks.mongoAgentSkillsUpdateOne).not.toHaveBeenCalled();
    expect(mocks.removeSkillPackageTTL).not.toHaveBeenCalled();
  });
});
