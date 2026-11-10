import { describe, expect, it, vi } from 'vitest';
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

  it('forwards optional session sequentially across moderation and system tool updates', async () => {
    const callOrder: string[] = [];
    const modUpdateSpy = vi
      .spyOn(MongoSystemModerationPlugin, 'updateMany')
      .mockImplementation((async () => {
        callOrder.push('moderation');
        return { modifiedCount: 1 };
      }) as any);
    const toolUpdateSpy = vi.spyOn(MongoSystemTool, 'updateMany').mockImplementation((async () => {
      callOrder.push('tool');
      return { modifiedCount: 1 };
    }) as any);
    const fakeSession = { id: 'mock-session' } as any;

    await restoreLocalPluginConfigs({
      pluginIds: ['restore.example'],
      session: fakeSession
    });

    expect(callOrder).toEqual(['moderation', 'tool']);
    expect(modUpdateSpy).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      session: fakeSession
    });
    expect(toolUpdateSpy).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      session: fakeSession
    });
    modUpdateSpy.mockRestore();
    toolUpdateSpy.mockRestore();
  });
});
