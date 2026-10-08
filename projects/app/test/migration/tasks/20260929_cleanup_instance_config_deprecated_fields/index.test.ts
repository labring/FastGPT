import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';

const mocks = vi.hoisted(() => ({
  cleanupInstanceConfigDeprecatedFields: vi.fn(),
  verifyInstanceConfigDeprecatedFields: vi.fn()
}));

vi.mock('@/migration/tasks/20260929_cleanup_instance_config_deprecated_fields/service', () => ({
  cleanupInstanceConfigDeprecatedFields: mocks.cleanupInstanceConfigDeprecatedFields,
  verifyInstanceConfigDeprecatedFields: mocks.verifyInstanceConfigDeprecatedFields
}));

import { cleanupInstanceConfigDeprecatedFieldsTask } from '@/migration/tasks/20260929_cleanup_instance_config_deprecated_fields';

const createContext = () =>
  ({
    reportProgress: vi.fn(),
    assertActive: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  }) as unknown as SystemMigrationContext;

describe('cleanupInstanceConfigDeprecatedFieldsTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports both stages as running then succeeded', async () => {
    mocks.cleanupInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      updatedDomains: ['site', 'vector'],
      removedFieldCount: 3
    });
    mocks.verifyInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      remainingDocuments: [],
      invalidDomains: []
    });

    const context = createContext();
    await cleanupInstanceConfigDeprecatedFieldsTask(context);

    const calls = (context.reportProgress as ReturnType<typeof vi.fn>).mock.calls.map(([arg]) => [
      arg.key,
      arg.status
    ]);
    expect(calls).toEqual([
      ['cleanup', SystemMigrationStatusEnum.running],
      ['cleanup', SystemMigrationStatusEnum.succeeded],
      ['validation', SystemMigrationStatusEnum.running],
      ['validation', SystemMigrationStatusEnum.succeeded]
    ]);
  });

  it('returns bounded scalar result params', async () => {
    mocks.cleanupInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      updatedDomains: ['site'],
      removedFieldCount: 2
    });
    mocks.verifyInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      remainingDocuments: [],
      invalidDomains: []
    });

    const result = await cleanupInstanceConfigDeprecatedFieldsTask(createContext());

    expect(result).toEqual({
      scannedDocuments: 11,
      updatedDomains: 1,
      removedFieldCount: 2
    });
  });

  it('throws when deprecated fields remain after cleanup', async () => {
    mocks.cleanupInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      updatedDomains: [],
      removedFieldCount: 0
    });
    mocks.verifyInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      remainingDocuments: ['vector'],
      invalidDomains: []
    });

    await expect(cleanupInstanceConfigDeprecatedFieldsTask(createContext())).rejects.toThrow(
      /remaining=\[vector\]/
    );
  });

  it('throws when a domain cannot be resolved by the new schema', async () => {
    mocks.cleanupInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      updatedDomains: [],
      removedFieldCount: 0
    });
    mocks.verifyInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      remainingDocuments: [],
      invalidDomains: ['providers']
    });

    await expect(cleanupInstanceConfigDeprecatedFieldsTask(createContext())).rejects.toThrow(
      /invalid=\[providers\]/
    );
  });

  it('does not mark validation succeeded when verification fails', async () => {
    mocks.cleanupInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      updatedDomains: [],
      removedFieldCount: 0
    });
    mocks.verifyInstanceConfigDeprecatedFields.mockResolvedValue({
      scannedDocuments: 11,
      remainingDocuments: ['auth'],
      invalidDomains: []
    });

    const context = createContext();
    await expect(cleanupInstanceConfigDeprecatedFieldsTask(context)).rejects.toThrow();

    const succeededKeys = (context.reportProgress as ReturnType<typeof vi.fn>).mock.calls
      .map(([arg]) => [arg.key, arg.status])
      .filter(([, status]) => status === SystemMigrationStatusEnum.succeeded)
      .map(([key]) => key);
    // 仅 cleanup 阶段允许成功，validation 必须停在 running
    expect(succeededKeys).toEqual(['cleanup']);
  });
});
