import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn() },
  withSandboxSourceMutationLease: vi.fn(),
  assertSandboxSourceDeleted: vi.fn(),
  deleteCurrentAppSandboxes: vi.fn(),
  deleteCurrentSkillSandboxes: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxSourceMutationLease: mocks.withSandboxSourceMutationLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceDeleted: mocks.assertSandboxSourceDeleted
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteAppSandboxes: mocks.deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes: mocks.deleteCurrentSkillSandboxes
}));

import {
  deleteAppSandboxes,
  deleteSkillEditSandboxes
} from '@fastgpt/service/core/ai/sandbox/interface/resource/sourceCleanup';

describe('Sandbox source cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ fn }) =>
      fn({ assertValid: vi.fn() })
    );
  });

  it('cleans an App only after validating its deleted source under the lease', async () => {
    await deleteAppSandboxes('app-1');

    expect(mocks.withSandboxSourceMutationLease).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        label: 'delete-app-sandboxes:app-1'
      })
    );
    expect(mocks.assertSandboxSourceDeleted).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });
    expect(mocks.deleteCurrentAppSandboxes).toHaveBeenCalledWith('app-1');
  });

  it('cleans each Skill in its own source lease', async () => {
    await deleteSkillEditSandboxes(['skill-1', 'skill-2']);

    expect(mocks.assertSandboxSourceDeleted).toHaveBeenCalledTimes(2);
    expect(mocks.deleteCurrentSkillSandboxes).toHaveBeenCalledWith(['skill-1']);
    expect(mocks.deleteCurrentSkillSandboxes).toHaveBeenCalledWith(['skill-2']);
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('reports all failed Skill source cleanups after the batch settles', async () => {
    mocks.withSandboxSourceMutationLease.mockRejectedValueOnce(new Error('lease failed'));

    await expect(deleteSkillEditSandboxes(['skill-1'])).rejects.toThrow(
      'Failed to clean up 1 Skill Sandbox sources'
    );
    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to clean up Skill Sandbox sources', {
      failureCount: 1,
      failures: [{ skillId: 'skill-1', error: 'lease failed' }]
    });
  });
});
