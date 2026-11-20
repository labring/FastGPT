import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn() },
  assertSandboxSourceDeleted: vi.fn(),
  deleteSandboxResourcesBySource: vi.fn(),
  deleteCurrentSkillSandboxes: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceDeleted: mocks.assertSandboxSourceDeleted
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteSandboxResourcesBySource: mocks.deleteSandboxResourcesBySource,
  deleteSkillEditSandboxes: mocks.deleteCurrentSkillSandboxes
}));

import {
  deleteAppSandboxes,
  deleteSkillEditSandboxes
} from '@fastgpt/service/core/ai/sandbox/interface/resource/sourceCleanup';

describe('Sandbox source cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('enforces deletion Store-Load fence before cleaning each App source', async () => {
    const events: string[] = [];
    mocks.assertSandboxSourceDeleted.mockImplementation(async ({ sourceType }) => {
      events.push(`deleted:${sourceType}`);
    });
    mocks.deleteSandboxResourcesBySource.mockImplementation(async ({ sourceType }) => {
      events.push(`cleanup:${sourceType}`);
    });

    await deleteAppSandboxes('app-1');

    expect(events).toEqual([
      'deleted:app',
      'cleanup:app',
      'deleted:workflowBuilder',
      'cleanup:workflowBuilder'
    ]);
    expect(mocks.deleteSandboxResourcesBySource.mock.calls).toEqual([
      [{ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' }],
      [{ sourceType: ChatSourceTypeEnum.workflowBuilder, sourceId: 'app-1' }]
    ]);
  });

  it.each([ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder])(
    'does not query or clean %s resources if the App deletion fence fails',
    async (sourceType) => {
      mocks.assertSandboxSourceDeleted.mockImplementation(async (params) => {
        if (params.sourceType === sourceType) throw new Error('source is active');
      });

      await expect(deleteAppSandboxes('app-1')).rejects.toThrow('source is active');

      expect(mocks.deleteSandboxResourcesBySource).not.toHaveBeenCalledWith({
        sourceType,
        sourceId: 'app-1'
      });
    }
  );

  it('propagates Builder cleanup failures so the deletion task can retry', async () => {
    mocks.deleteSandboxResourcesBySource
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Builder deletion failed'));

    await expect(deleteAppSandboxes('app-1')).rejects.toThrow('Builder deletion failed');

    expect(mocks.deleteSandboxResourcesBySource).toHaveBeenCalledTimes(2);
    expect(mocks.deleteSandboxResourcesBySource).toHaveBeenLastCalledWith({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: 'app-1'
    });
  });

  it('checks deletion fence for each Skill, deletes in batch, and reports settled failures', async () => {
    await deleteSkillEditSandboxes(['skill-1', 'skill-2']);

    expect(mocks.assertSandboxSourceDeleted).toHaveBeenCalledTimes(2);
    expect(mocks.deleteCurrentSkillSandboxes).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCurrentSkillSandboxes).toHaveBeenCalledWith(['skill-1', 'skill-2']);
    expect(mocks.logger.error).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.deleteCurrentSkillSandboxes.mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(deleteSkillEditSandboxes(['skill-1', 'skill-2'])).rejects.toThrow(
      'Failed to clean up 2 Skill Sandbox sources'
    );
    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to clean up Skill Sandbox sources', {
      failureCount: 2,
      failures: [
        { skillId: 'skill-1', error: 'cleanup failed' },
        { skillId: 'skill-2', error: 'cleanup failed' }
      ]
    });
  });
});
