import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn() },
  withSandboxSourceMutationLease: vi.fn(),
  assertSandboxSourceDeleted: vi.fn(),
  deleteSandboxResourcesBySource: vi.fn(),
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
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ fn }) =>
      fn({ assertValid: vi.fn() })
    );
  });

  it('validates and cleans each App source inside its own lease, without nesting source leases', async () => {
    const events: string[] = [];
    const activeSources = new Set<ChatSourceTypeEnum>();
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ sourceType, fn }) => {
      expect(activeSources.size).toBe(0);
      activeSources.add(sourceType);
      events.push(`acquire:${sourceType}`);
      try {
        await fn({ assertValid: () => events.push(`validate:${sourceType}`) });
      } finally {
        activeSources.delete(sourceType);
        events.push(`release:${sourceType}`);
      }
    });
    mocks.assertSandboxSourceDeleted.mockImplementation(async ({ sourceType }) => {
      expect(activeSources.has(sourceType)).toBe(true);
      events.push(`deleted:${sourceType}`);
    });
    mocks.deleteSandboxResourcesBySource.mockImplementation(async ({ sourceType }) => {
      expect(activeSources.has(sourceType)).toBe(true);
      events.push(`cleanup:${sourceType}`);
    });

    await deleteAppSandboxes('app-1');

    expect(events).toEqual([
      'acquire:app',
      'deleted:app',
      'validate:app',
      'cleanup:app',
      'release:app',
      'acquire:workflowBuilder',
      'deleted:workflowBuilder',
      'validate:workflowBuilder',
      'cleanup:workflowBuilder',
      'release:workflowBuilder'
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

  it('does not query or clean resources when the source lease has been lost', async () => {
    mocks.withSandboxSourceMutationLease.mockImplementationOnce(async ({ fn }) =>
      fn({
        assertValid: () => {
          throw new Error('lease lost');
        }
      })
    );

    await expect(deleteAppSandboxes('app-1')).rejects.toThrow('lease lost');

    expect(mocks.assertSandboxSourceDeleted).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSandboxResourcesBySource).not.toHaveBeenCalled();
  });

  it('leaves a busy Builder source untouched and rechecks both sources on retry', async () => {
    mocks.withSandboxSourceMutationLease
      .mockImplementationOnce(async ({ fn }) => fn({ assertValid: vi.fn() }))
      .mockRejectedValueOnce(new Error('Builder source lease is busy'));

    await expect(deleteAppSandboxes('app-1')).rejects.toThrow('Builder source lease is busy');

    expect(mocks.deleteSandboxResourcesBySource).toHaveBeenCalledExactlyOnceWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });

    await deleteAppSandboxes('app-1');

    expect(mocks.assertSandboxSourceDeleted.mock.calls).toEqual([
      [{ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' }],
      [{ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' }],
      [{ sourceType: ChatSourceTypeEnum.workflowBuilder, sourceId: 'app-1' }]
    ]);
    expect(mocks.deleteSandboxResourcesBySource).toHaveBeenLastCalledWith({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: 'app-1'
    });
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
