import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({ withLease: vi.fn() }));

vi.mock('@fastgpt/dal/redis/caches', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/dal/redis/caches')>();
  return {
    ...actual,
    LeaseCache: class MockLeaseCache {
      withLease = mocks.withLease;
    }
  };
});

import {
  withLegacySandboxMigrationJobLease,
  withSandboxLifecycleLease,
  withSandboxSourceMutationLease
} from '@fastgpt/service/core/ai/sandbox/application/lease';

describe('sandbox lifecycle leases', () => {
  beforeEach(() => {
    mocks.withLease.mockReset();
    mocks.withLease.mockImplementation(async ({ fn }) =>
      fn({ signal: new AbortController().signal, assertValid: vi.fn() })
    );
  });

  it('uses the app mutation key for both app and workflow builder sources', async () => {
    await withSandboxSourceMutationLease({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      label: 'create-app-sandbox',
      fn: vi.fn().mockResolvedValue(undefined)
    });
    await withSandboxSourceMutationLease({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: 'app-1',
      label: 'prewarm-workflow-builder-sandbox',
      fn: vi.fn().mockResolvedValue(undefined)
    });
    await withSandboxLifecycleLease({
      sandboxId: 'stable-id',
      label: 'archive-sandbox',
      fn: vi.fn().mockResolvedValue(undefined)
    });
    await withLegacySandboxMigrationJobLease({
      label: 'migrate-user-sandboxes',
      fn: vi.fn().mockResolvedValue(undefined)
    });

    expect(mocks.withLease.mock.calls.map(([params]) => params.key)).toEqual([
      'agent-sandbox:source:app:app-1',
      'agent-sandbox:source:app:app-1',
      'agent-sandbox:lifecycle:stable-id',
      'agent-sandbox:legacy-migration-job'
    ]);
  });
});
