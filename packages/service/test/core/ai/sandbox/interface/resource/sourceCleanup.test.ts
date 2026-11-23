import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => {
  class MockSandboxBatchDeleteError extends Error {
    readonly failures: ReadonlyArray<{ sandboxId: string; sourceId?: string; error: string }>;
    constructor(failures: ReadonlyArray<{ sandboxId: string; sourceId?: string; error: string }>) {
      super(`Failed to delete ${failures.length} sandbox resources`);
      this.name = 'SandboxBatchDeleteError';
      this.failures = failures;
    }
  }
  return {
    SandboxBatchDeleteError: MockSandboxBatchDeleteError,
    logger: { error: vi.fn() },
    assertSandboxSourceDeleted: vi.fn(),
    findDeletedSkillIds: vi.fn(),
    deleteSandboxResourcesBySource: vi.fn(),
    deleteCurrentSkillSandboxes: vi.fn()
  };
});

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceDeleted: mocks.assertSandboxSourceDeleted,
  findDeletedSkillIds: mocks.findDeletedSkillIds
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  SandboxBatchDeleteError: mocks.SandboxBatchDeleteError,
  deleteSandboxResourcesBySource: mocks.deleteSandboxResourcesBySource,
  deleteSkillEditSandboxes: mocks.deleteCurrentSkillSandboxes
}));

import { SandboxBatchDeleteError } from '@fastgpt/service/core/ai/sandbox/application/resource';
import {
  deleteAppSandboxes,
  deleteSkillEditSandboxes
} from '@fastgpt/service/core/ai/sandbox/interface/resource/sourceCleanup';

describe('Sandbox source cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('enforces deletion Store-Load fence once before cleaning all App sources', async () => {
    const events: string[] = [];
    mocks.assertSandboxSourceDeleted.mockImplementation(async ({ sourceType }) => {
      events.push(`deleted:${sourceType}`);
    });
    mocks.deleteSandboxResourcesBySource.mockImplementation(async ({ sourceType }) => {
      events.push(`cleanup:${sourceType}`);
    });

    await deleteAppSandboxes('app-1');

    expect(events).toEqual(['deleted:app', 'cleanup:app', 'cleanup:workflowBuilder']);
    expect(mocks.assertSandboxSourceDeleted).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSandboxResourcesBySource.mock.calls).toEqual([
      [{ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' }],
      [{ sourceType: ChatSourceTypeEnum.workflowBuilder, sourceId: 'app-1' }]
    ]);
  });

  it('does not query or clean any App source if the App deletion fence fails', async () => {
    mocks.assertSandboxSourceDeleted.mockRejectedValueOnce(new Error('source is active'));

    await expect(deleteAppSandboxes('app-1')).rejects.toThrow('source is active');

    expect(mocks.deleteSandboxResourcesBySource).not.toHaveBeenCalled();
  });

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

  it('checks deletion fence for Skills in batch, deletes in batch, and attributes individual failures accurately', async () => {
    mocks.findDeletedSkillIds.mockResolvedValueOnce(new Set(['skill-1', 'skill-2']));
    await deleteSkillEditSandboxes(['skill-1', 'skill-2']);

    expect(mocks.findDeletedSkillIds).toHaveBeenCalledWith(['skill-1', 'skill-2']);
    expect(mocks.deleteCurrentSkillSandboxes).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCurrentSkillSandboxes).toHaveBeenCalledWith(['skill-1', 'skill-2']);
    expect(mocks.logger.error).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.findDeletedSkillIds.mockResolvedValueOnce(new Set(['skill-1', 'skill-2']));
    mocks.deleteCurrentSkillSandboxes.mockRejectedValueOnce(
      new SandboxBatchDeleteError([
        { sandboxId: 'sb-1', sourceId: 'skill-1', error: 'cleanup 1 failed' }
      ])
    );

    await expect(deleteSkillEditSandboxes(['skill-1', 'skill-2'])).rejects.toThrow(
      'Failed to clean up 1 Skill Sandbox sources'
    );
    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to clean up Skill Sandbox sources', {
      failureCount: 1,
      failures: [{ skillId: 'skill-1', error: 'cleanup 1 failed' }]
    });
  });
});
