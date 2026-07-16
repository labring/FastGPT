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

  it('builds a source-scoped key and forwards the lease context', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(
      withSandboxSourceMutationLease({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        label: 'create-app-sandbox',
        fn
      })
    ).resolves.toBe('ok');

    expect(mocks.withRedisLease).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'agent-sandbox:source:app:app-1',
        label: 'create-app-sandbox'
      })
    );
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        assertValid: expect.any(Function)
      })
    );
  });

  it('uses a provider-independent lifecycle key', async () => {
    await withSandboxLifecycleLease({
      sandboxId: 'stable-id',
      label: 'archive-sandbox',
      fn: vi.fn().mockResolvedValue(undefined)
    });

    expect(mocks.withRedisLease).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'agent-sandbox:lifecycle:stable-id',
        label: 'archive-sandbox'
      })
    );
  });

  it('keeps the migration job lock separate from resource correctness locks', async () => {
    await withLegacySandboxMigrationJobLease({
      label: 'migrate-user-sandboxes',
      fn: vi.fn().mockResolvedValue(undefined)
    });

    expect(mocks.withRedisLease).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'agent-sandbox:legacy-migration-job',
        label: 'migrate-user-sandboxes'
      })
    );
  });
});
