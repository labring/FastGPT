import { describe, expect, it } from 'vitest';
import { restoreLocalPluginConfigs } from '../../../core/plugin/restoreLocalConfigs';
import { MongoSystemTool } from '../../../core/plugin/tool/systemToolSchema';
import { MongoSystemModerationPlugin } from '../../../core/plugin/moderation/schema';

describe('restoreLocalPluginConfigs', () => {
  it('restores only confirmed parent and child configs while retaining secrets', async () => {
    await MongoSystemTool.create([
      {
        pluginId: 'systemTool-restore.example',
        status: 'Offline',
        secretsVal: { key: 'encrypted-fixture' }
      },
      { pluginId: 'systemTool-restore.example/child', status: 'Offline' },
      { pluginId: 'systemTool-restoreXexample', status: 'Offline' }
    ]);
    await MongoSystemModerationPlugin.create({
      pluginId: 'restore.example',
      source: 'system',
      deleted: true,
      enabled: false,
      secretsVal: { key: 'encrypted-fixture' }
    });
    await restoreLocalPluginConfigs({ pluginIds: ['restore.example'] });
    expect(
      (await MongoSystemTool.findOne({ pluginId: 'systemTool-restore.example' }))?.status
    ).toBe('Normal');
    expect(
      (await MongoSystemTool.findOne({ pluginId: 'systemTool-restore.example/child' }))?.status
    ).toBe('Normal');
    expect(
      (await MongoSystemTool.findOne({ pluginId: 'systemTool-restoreXexample' }))?.status
    ).toBe('Offline');
    expect(
      await MongoSystemModerationPlugin.findOne({ pluginId: 'restore.example' }).lean()
    ).toMatchObject({ deleted: false, enabled: false, secretsVal: { key: 'encrypted-fixture' } });
  });
});
