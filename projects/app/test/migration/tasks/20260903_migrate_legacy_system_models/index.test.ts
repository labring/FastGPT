import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';

const mocks = vi.hoisted(() => ({
  preloadModelProviders: vi.fn(),
  getPluginSystemModelDocuments: vi.fn(),
  loadInstalledModels: vi.fn(),
  inspectLegacySystemModelMigration: vi.fn(),
  bootstrapAIModelsFromLegacy: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/provider/controller', () => ({
  preloadModelProviders: mocks.preloadModelProviders
}));
vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  getPluginSystemModelDocuments: mocks.getPluginSystemModelDocuments,
  loadInstalledModels: mocks.loadInstalledModels
}));
vi.mock('@/migration/tasks/20260903_migrate_legacy_system_models/service', () => ({
  inspectLegacySystemModelMigration: mocks.inspectLegacySystemModelMigration,
  bootstrapAIModelsFromLegacy: mocks.bootstrapAIModelsFromLegacy
}));

import { migrateLegacySystemModels } from '@/migration/tasks/20260903_migrate_legacy_system_models';

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

describe('migrateLegacySystemModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preloadModelProviders.mockResolvedValue(undefined);
    mocks.getPluginSystemModelDocuments.mockResolvedValue([{ model: 'plugin-model' }]);
    mocks.loadInstalledModels.mockResolvedValue(undefined);
    mocks.inspectLegacySystemModelMigration.mockResolvedValue({ sourceCount: 3, targetCount: 0 });
    mocks.bootstrapAIModelsFromLegacy.mockResolvedValue({
      status: 'migrated',
      sourceCount: 3,
      targetCount: 5,
      migratedCount: 2
    });
  });

  it('loads templates, checks the lease, migrates, and reports the latest progress', async () => {
    const context = createContext();

    await expect(migrateLegacySystemModels(context)).resolves.toEqual({
      sourceCount: 3,
      targetCount: 5,
      migratedCount: 2
    });

    expect(mocks.preloadModelProviders).toHaveBeenCalledOnce();
    expect(mocks.getPluginSystemModelDocuments).toHaveBeenCalledOnce();
    expect(context.assertActive).toHaveBeenCalledTimes(2);
    expect(mocks.bootstrapAIModelsFromLegacy).toHaveBeenCalledWith({
      pluginDocuments: [{ model: 'plugin-model' }]
    });
    expect(mocks.loadInstalledModels).toHaveBeenCalledWith();
    expect(context.reportProgress).toHaveBeenNthCalledWith(1, {
      key: 'loading_templates',
      status: SystemMigrationStatusEnum.running
    });
    expect(context.reportProgress).toHaveBeenNthCalledWith(2, {
      key: 'loading_templates',
      status: SystemMigrationStatusEnum.succeeded
    });
    expect(context.reportProgress).toHaveBeenNthCalledWith(3, {
      key: 'migrating',
      status: SystemMigrationStatusEnum.running
    });
    expect(context.reportProgress).toHaveBeenNthCalledWith(4, {
      key: 'migrating',
      status: SystemMigrationStatusEnum.succeeded
    });
    expect(context.reportProgress).toHaveBeenNthCalledWith(5, {
      key: 'reloading_models',
      status: SystemMigrationStatusEnum.running
    });
    expect(context.reportProgress).toHaveBeenNthCalledWith(6, {
      key: 'reloading_models',
      status: SystemMigrationStatusEnum.succeeded
    });
    expect(context.reportProgress).toHaveBeenCalledTimes(6);
    expect(context.logger.info).toHaveBeenCalledWith('Legacy system model migration completed', {
      status: 'migrated',
      sourceCount: 3,
      targetCount: 5,
      migratedCount: 2
    });
  });

  it('still merges legacy data when system models already exist', async () => {
    const context = createContext();
    mocks.inspectLegacySystemModelMigration.mockResolvedValue({ sourceCount: 3, targetCount: 4 });

    await expect(migrateLegacySystemModels(context)).resolves.toEqual({
      sourceCount: 3,
      targetCount: 5,
      migratedCount: 2
    });

    expect(mocks.preloadModelProviders).toHaveBeenCalledOnce();
    expect(mocks.getPluginSystemModelDocuments).toHaveBeenCalledOnce();
    expect(mocks.bootstrapAIModelsFromLegacy).toHaveBeenCalledWith({
      pluginDocuments: [{ model: 'plugin-model' }]
    });
    expect(mocks.loadInstalledModels).toHaveBeenCalledOnce();
    expect(context.assertActive).toHaveBeenCalledTimes(2);
    expect(context.reportProgress).toHaveBeenCalledTimes(6);
    expect(context.logger.info).toHaveBeenCalledWith('Legacy system model migration completed', {
      status: 'migrated',
      sourceCount: 3,
      targetCount: 5,
      migratedCount: 2
    });
  });

  it('migrates an empty legacy collection without requesting templates', async () => {
    const context = createContext();
    mocks.inspectLegacySystemModelMigration.mockResolvedValue({ sourceCount: 0, targetCount: 0 });
    mocks.bootstrapAIModelsFromLegacy.mockResolvedValue({
      status: 'migrated',
      sourceCount: 0,
      targetCount: 0,
      migratedCount: 0
    });

    await expect(migrateLegacySystemModels(context)).resolves.toEqual({
      sourceCount: 0,
      targetCount: 0,
      migratedCount: 0
    });

    expect(mocks.preloadModelProviders).not.toHaveBeenCalled();
    expect(mocks.getPluginSystemModelDocuments).not.toHaveBeenCalled();
    expect(mocks.bootstrapAIModelsFromLegacy).toHaveBeenCalledWith({ pluginDocuments: [] });
    expect(mocks.loadInstalledModels).toHaveBeenCalledOnce();
  });

  it('propagates migration errors without reporting completion', async () => {
    const context = createContext();
    const error = new Error('invalid legacy model');
    mocks.bootstrapAIModelsFromLegacy.mockRejectedValue(error);

    await expect(migrateLegacySystemModels(context)).rejects.toBe(error);
    expect(context.reportProgress).toHaveBeenCalledTimes(3);
    expect(mocks.loadInstalledModels).not.toHaveBeenCalled();
    expect(context.logger.info).not.toHaveBeenCalled();
  });

  it('does not complete when the post-migration model cache reload fails', async () => {
    const context = createContext();
    const error = new Error('model cache reload failed');
    mocks.loadInstalledModels.mockRejectedValue(error);

    await expect(migrateLegacySystemModels(context)).rejects.toBe(error);
    expect(context.reportProgress).toHaveBeenCalledTimes(5);
    expect(context.logger.info).not.toHaveBeenCalled();
  });
});
