import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({ withRedisLease: vi.fn() }));

vi.mock('@fastgpt/service/common/redis/lock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/redis/lock')>();
  return { ...actual, withRedisLease: mocks.withRedisLease };
});

import {
  withLegacySandboxMigrationJobLease,
  withSandboxLifecycleLease,
  withSandboxSourceMutationLease
} from '@fastgpt/service/core/ai/sandbox/application/lease';

describe('sandbox lifecycle leases', () => {
  beforeEach(() => {
    mocks.withRedisLease.mockReset();
    mocks.withRedisLease.mockImplementation(async ({ fn }) =>
      fn({ signal: new AbortController().signal, assertValid: vi.fn() })
    );
  });

  it('uses separate source, lifecycle and migration lease keys', async () => {
    await withSandboxSourceMutationLease({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      label: 'create-app-sandbox',
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

    expect(mocks.withRedisLease.mock.calls.map(([params]) => params.key)).toEqual([
      'agent-sandbox:source:app:app-1',
      'agent-sandbox:lifecycle:stable-id',
      'agent-sandbox:legacy-migration-job'
    ]);
  });
});
