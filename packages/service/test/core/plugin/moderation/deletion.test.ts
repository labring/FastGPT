import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entity from '../../../../core/plugin/moderation/entity';
import * as fastgptPluginMod from '../../../../thirdProvider/fastgptPlugin/moderation';
import {
  deleteModerationPlugin,
  getAdminModerationPluginList
} from '../../../../core/plugin/moderation/service';

describe('moderation plugin deletion and filtering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('excludes deleted plugins when includeDeleted is false', async () => {
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
        deleted: true
      }
    ]);

    // 默认 includeDeleted 为 false，已删除项不应展示
    const list = await getAdminModerationPluginList();
    expect(list.map((item) => item.pluginId)).toEqual(['plugin-active']);

    // 显式指定 includeDeleted: true 时才展示已删除项
    const listWithDeleted = await getAdminModerationPluginList({ includeDeleted: true });
    expect(listWithDeleted.map((item) => item.pluginId)).toContain('plugin-deleted');
  });

  it('allows deleting an unconfigured plugin and marks it deleted', async () => {
    vi.spyOn(entity, 'findModerationConfig').mockResolvedValue(null);
    const softDeleteSpy = vi.spyOn(entity, 'softDeleteModerationConfig').mockResolvedValue({} as any);

    await expect(deleteModerationPlugin({ pluginId: 'new-plugin' })).resolves.toBeUndefined();
    expect(softDeleteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'new-plugin'
      })
    );
  });

  it('rejects deletion if the plugin is currently enabled', async () => {
    vi.spyOn(entity, 'findModerationConfig').mockResolvedValue({
      pluginId: 'active-plugin',
      enabled: true
    });
    const softDeleteSpy = vi.spyOn(entity, 'softDeleteModerationConfig');

    await expect(deleteModerationPlugin({ pluginId: 'active-plugin' })).rejects.toBe(
      'Disable the moderation plugin before deleting it'
    );
    expect(softDeleteSpy).not.toHaveBeenCalled();
  });
});
