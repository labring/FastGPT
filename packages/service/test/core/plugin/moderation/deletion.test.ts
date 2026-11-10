import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as lifecycle from '../../../../thirdProvider/fastgptPlugin/lifecycle';
import * as entity from '../../../../core/plugin/moderation/entity';
import { MongoSystemModerationPlugin } from '../../../../core/plugin/moderation/schema';
import * as fastgptPluginMod from '../../../../thirdProvider/fastgptPlugin/moderation';
import {
  deleteModerationPlugin,
  restoreModerationPlugin,
  getAdminModerationPluginList
} from '../../../../core/plugin/moderation/service';

describe('moderation plugin deletion and filtering', () => {
  beforeEach(() => {
    vi.spyOn(lifecycle, 'disableSystemPlugin').mockResolvedValue(undefined);
    vi.spyOn(lifecycle, 'restoreSystemPlugin').mockResolvedValue(undefined);
    vi.spyOn(lifecycle, 'getRetainedModerationDetail').mockImplementation(
      async (pluginId) =>
        ({
          pluginId,
          source: 'system',
          type: 'moderation',
          name: pluginId,
          meta: { provider: 'test' },
          secretSchema: {}
        }) as any
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hides soft-uninstalled plugins but includes them for restoration', async () => {
    vi.spyOn(fastgptPluginMod, 'listModerationPlugins').mockResolvedValue([
      {
        pluginId: 'plugin-active',
        source: 'system',
        type: 'moderation' as any,
        version: '1.0.0'
      },
      {
        pluginId: 'plugin-deleted',
        source: 'system',
        type: 'moderation' as any,
        version: '1.0.0'
      }
    ]);

    vi.spyOn(fastgptPluginMod, 'getModerationPluginDetail').mockImplementation(
      async ({ pluginId }) => ({
        pluginId,
        source: 'system',
        version: '1.0.0',
        name: pluginId,
        type: 'moderation',
        meta: { provider: 'test' },
        secretSchema: {}
      })
    );

    vi.spyOn(entity, 'findAllModerationConfigs').mockResolvedValue([
      {
        pluginId: 'plugin-active',
        enabled: false,
        deleted: false
      },
      {
        pluginId: 'plugin-deleted',
        enabled: false,
        deleted: true,
        secretsVal: { apiKey: 'historical-secret' }
      }
    ]);

    const list = await getAdminModerationPluginList();
    expect(list.map((item) => item.pluginId)).toEqual(['plugin-active']);
    const all = await getAdminModerationPluginList({ includeDeleted: true });
    expect(all.find((item) => item.pluginId === 'plugin-deleted')?.deleted).toBe(true);
  });

  it('soft-uninstalls an unconfigured installed plugin', async () => {
    vi.spyOn(entity, 'findModerationConfig').mockResolvedValue(null);
    const deleteConfigSpy = vi
      .spyOn(entity, 'softDeleteModerationConfig')
      .mockResolvedValue({ deletedCount: 1 } as any);

    await expect(
      deleteModerationPlugin({ pluginId: 'new-plugin', source: 'system' })
    ).resolves.toBeUndefined();
    expect(deleteConfigSpy).toHaveBeenCalledWith({ pluginId: 'new-plugin', source: 'system' });
  });

  it('restores a moderation plugin without overwriting configuration', async () => {
    vi.spyOn(fastgptPluginMod, 'getModerationPluginDetail').mockResolvedValue({
      type: 'moderation'
    } as any);
    const restore = vi.spyOn(entity, 'restoreModerationConfigs').mockResolvedValue({} as any);
    await restoreModerationPlugin({ pluginId: 'plugin-deleted' });
    expect(restore).toHaveBeenCalledWith({ pluginIds: ['plugin-deleted'], source: 'system' });
  });

  it('does not restore an unavailable package', async () => {
    vi.mocked(lifecycle.getRetainedModerationDetail).mockRejectedValue(new Error('missing'));
    const restore = vi.spyOn(entity, 'restoreModerationConfigs');
    await expect(restoreModerationPlugin({ pluginId: 'missing' })).rejects.toThrow('missing');
    expect(restore).not.toHaveBeenCalled();
  });

  it('restores tombstones without changing credentials, version or already active records', async () => {
    await MongoSystemModerationPlugin.create([
      {
        pluginId: 'restore-saved',
        source: 'system',
        deleted: true,
        enabled: false,
        version: '1.0.0',
        secretsVal: { key: 'encrypted-fixture' }
      },
      { pluginId: 'restore-active', source: 'system', deleted: false, enabled: true },
      { pluginId: 'restore-saved', source: 'teamId:other', deleted: true }
    ]);
    await entity.restoreModerationConfigs({ pluginIds: ['restore-saved', 'restore-active'] });
    const restored = await MongoSystemModerationPlugin.findOne({
      pluginId: 'restore-saved',
      source: 'system'
    }).lean();
    expect(restored).toMatchObject({
      deleted: false,
      enabled: false,
      version: '1.0.0',
      secretsVal: { key: 'encrypted-fixture' }
    });
    expect(
      await MongoSystemModerationPlugin.findOne({ pluginId: 'restore-active' }).lean()
    ).toMatchObject({ enabled: true });
    expect(
      await MongoSystemModerationPlugin.findOne({
        pluginId: 'restore-saved',
        source: 'teamId:other'
      }).lean()
    ).toMatchObject({ deleted: true });
  });

  it('forwards optional session when restoring moderation configs', async () => {
    const updateManySpy = vi
      .spyOn(MongoSystemModerationPlugin, 'updateMany')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    const fakeSession = { id: 'mock-session' } as any;

    await entity.restoreModerationConfigs({
      pluginIds: ['restore-saved'],
      source: 'system',
      session: fakeSession
    });

    expect(updateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: { $in: ['restore-saved'] },
        deleted: true
      }),
      expect.any(Object),
      { session: fakeSession }
    );
  });

  it('rejects deletion if the plugin is currently enabled', async () => {
    vi.spyOn(entity, 'findModerationConfig').mockResolvedValue({
      pluginId: 'active-plugin',
      enabled: true
    });
    const deleteConfigSpy = vi.spyOn(entity, 'softDeleteModerationConfig');

    await expect(deleteModerationPlugin({ pluginId: 'active-plugin' })).rejects.toBe(
      'Disable the moderation plugin before deleting it'
    );
    expect(deleteConfigSpy).not.toHaveBeenCalled();
  });
});
