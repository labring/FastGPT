import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import { DefaultSystemModerationPolicy } from '@fastgpt/global/core/plugin/moderation/type';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { MongoTeamAudit } from '@fastgpt/service/support/user/audit/schema';
import { MongoSystemModerationPlugin } from '@fastgpt/service/core/plugin/moderation/schema';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import * as remoteModeration from '@fastgpt/service/thirdProvider/fastgptPlugin/moderation';
import * as lifecycle from '@fastgpt/service/thirdProvider/fastgptPlugin/lifecycle';
import * as moderationEntity from '@fastgpt/service/core/plugin/moderation/entity';
import * as moderationService from '@fastgpt/service/core/plugin/moderation/service';
import {
  captureModerationConfigAuditSnapshot,
  captureModerationPolicyAuditSnapshot,
  captureModerationUninstallAuditSnapshot,
  hasModerationPolicyConfigChanged,
  recordInstalledModerationPluginsAudit,
  recordModerationConfigAudit,
  recordModerationPolicyAudit,
  recordModerationRestoreAudit,
  recordModerationUninstallAudit,
  resolveModerationPluginName
} from '@fastgpt/service/core/plugin/moderation/audit';

const operator = {
  teamId: '68ad85a7463006c963799a01',
  tmbId: '68ad85a7463006c963799a02'
};

describe('moderation admin audit helpers', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoTeamAudit.deleteMany({}),
      MongoSystemModerationPlugin.deleteMany({}),
      MongoSystemConfigs.deleteMany({ type: SystemConfigsTypeEnum.moderationPolicy })
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveModerationPluginName', () => {
    it('resolves localized name from active plugin detail', async () => {
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'baidu-moderation',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: { 'zh-CN': '百度内容审核', en: 'Baidu Moderation' },
        meta: { provider: 'baidu' },
        secretSchema: {}
      });

      await expect(
        resolveModerationPluginName({ pluginId: 'baidu-moderation', lang: 'zh-CN' })
      ).resolves.toBe('百度内容审核');
    });

    it('falls back to retained detail when active detail fails', async () => {
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockRejectedValueOnce(
        new Error('disabled')
      );
      vi.spyOn(lifecycle, 'getRetainedModerationDetail').mockResolvedValueOnce({
        pluginId: 'keyword-moderation',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '敏感词审核',
        meta: { provider: 'keyword' },
        secretSchema: {}
      });

      await expect(
        resolveModerationPluginName({ pluginId: 'keyword-moderation', lang: 'zh-CN' })
      ).resolves.toBe('敏感词审核');
    });

    it('falls back to pluginId when both active and retained details are unavailable or blank', async () => {
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockRejectedValueOnce(
        new Error('missing')
      );
      vi.spyOn(lifecycle, 'getRetainedModerationDetail').mockRejectedValueOnce(new Error('pruned'));

      await expect(resolveModerationPluginName({ pluginId: 'pruned-plugin' })).resolves.toBe(
        'pruned-plugin'
      );

      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'blank-name-plugin',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '   ',
        meta: { provider: 'custom' },
        secretSchema: {}
      });
      await expect(resolveModerationPluginName({ pluginId: 'blank-name-plugin' })).resolves.toBe(
        'blank-name-plugin'
      );
    });
  });

  describe('hasModerationPolicyConfigChanged', () => {
    it('ignores enabled and activePluginId changes when hooks and strategy match', () => {
      expect(
        hasModerationPolicyConfigChanged({
          prevPolicy: DefaultSystemModerationPolicy,
          nextPolicy: {
            ...DefaultSystemModerationPolicy,
            enabled: true,
            activePluginId: 'baidu-moderation'
          }
        })
      ).toBe(false);
    });

    it('detects changes in hooks or strategy fields', () => {
      expect(
        hasModerationPolicyConfigChanged({
          prevPolicy: DefaultSystemModerationPolicy,
          nextPolicy: {
            ...DefaultSystemModerationPolicy,
            hooks: {
              ...DefaultSystemModerationPolicy.hooks,
              modelInput: !DefaultSystemModerationPolicy.hooks.modelInput
            }
          }
        })
      ).toBe(true);

      expect(
        hasModerationPolicyConfigChanged({
          prevPolicy: DefaultSystemModerationPolicy,
          nextPolicy: {
            ...DefaultSystemModerationPolicy,
            strategy: {
              ...DefaultSystemModerationPolicy.strategy,
              streamInterval: DefaultSystemModerationPolicy.strategy.streamInterval + 50,
              suspectedRiskAction: ModerationRiskActionEnum.passAndLog,
              serviceExceptionAction: ModerationExceptionActionEnum.block
            }
          }
        })
      ).toBe(true);
    });
  });

  describe('captureModerationPolicyAuditSnapshot & recordModerationPolicyAudit', () => {
    it('skips snapshot and write when operator lacks teamId or tmbId', async () => {
      expect(await captureModerationPolicyAuditSnapshot(undefined)).toBeUndefined();
      expect(await captureModerationPolicyAuditSnapshot({ tmbId: operator.tmbId })).toBeUndefined();

      await recordModerationPolicyAudit({
        operator: undefined,
        snapshot: { prevPolicy: DefaultSystemModerationPolicy },
        nextPolicy: DefaultSystemModerationPolicy
      });
      expect(await MongoTeamAudit.countDocuments({})).toBe(0);
    });

    it('returns undefined gracefully when snapshot query throws', async () => {
      vi.spyOn(moderationService, 'getModerationPolicy').mockRejectedValueOnce(
        new Error('db unavailable')
      );
      await expect(captureModerationPolicyAuditSnapshot(operator)).resolves.toBeUndefined();
    });

    it('logs only plugin enablement when turning moderation on without changing hooks or strategy', async () => {
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'baidu-moderation',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '百度内容审核',
        meta: { provider: 'baidu' },
        secretSchema: {}
      });

      const snapshot = await captureModerationPolicyAuditSnapshot(operator);
      await recordModerationPolicyAudit({
        operator,
        snapshot,
        nextPolicy: {
          ...DefaultSystemModerationPolicy,
          enabled: true,
          activePluginId: 'baidu-moderation'
        }
      });

      const logs = await MongoTeamAudit.find({}).sort({ _id: 1 }).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN,
        metadata: { pluginName: '百度内容审核' }
      });
    });

    it('logs old plugin disable, new plugin enable, and policy update when switching plugin and editing strategy', async () => {
      await MongoSystemModerationPlugin.create({
        pluginId: 'baidu-moderation',
        source: 'system',
        enabled: true
      });
      await MongoSystemConfigs.create({
        type: SystemConfigsTypeEnum.moderationPolicy,
        value: {
          ...DefaultSystemModerationPolicy,
          enabled: true,
          activePluginId: 'baidu-moderation'
        }
      });

      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockImplementation(
        async ({ pluginId }) => ({
          pluginId,
          source: 'system',
          version: '1.0.0',
          type: 'moderation',
          name: pluginId === 'baidu-moderation' ? '百度内容审核' : '阿里云内容安全',
          meta: { provider: 'test' },
          secretSchema: {}
        })
      );

      const snapshot = await captureModerationPolicyAuditSnapshot(operator);
      await recordModerationPolicyAudit({
        operator,
        snapshot,
        nextPolicy: {
          enabled: true,
          activePluginId: 'aliyun-moderation',
          hooks: {
            ...DefaultSystemModerationPolicy.hooks,
            modelInput: !DefaultSystemModerationPolicy.hooks.modelInput
          },
          strategy: DefaultSystemModerationPolicy.strategy
        }
      });

      const logs = await MongoTeamAudit.find({}).sort({ _id: 1 }).lean();
      expect(logs.map((item) => ({ event: item.event, metadata: item.metadata }))).toEqual([
        {
          event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
          metadata: { pluginName: '百度内容审核' }
        },
        {
          event: AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN,
          metadata: { pluginName: '阿里云内容安全' }
        },
        {
          event: AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_POLICY,
          metadata: undefined
        }
      ]);
    });

    it('logs plugin disablement when global moderation is turned off', async () => {
      await MongoSystemModerationPlugin.create({
        pluginId: 'baidu-moderation',
        source: 'system',
        enabled: true
      });
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'baidu-moderation',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '百度内容审核',
        meta: { provider: 'baidu' },
        secretSchema: {}
      });

      const snapshot = await captureModerationPolicyAuditSnapshot(operator);
      await recordModerationPolicyAudit({
        operator,
        snapshot,
        nextPolicy: {
          ...DefaultSystemModerationPolicy,
          enabled: false
        }
      });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
        metadata: { pluginName: '百度内容审核' }
      });
    });
  });

  describe('captureModerationConfigAuditSnapshot & recordModerationConfigAudit', () => {
    it('logs config modification without exposing any secret values and handles enable/disable transitions', async () => {
      await MongoSystemModerationPlugin.create({
        pluginId: 'old-active',
        source: 'system',
        enabled: true
      });
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValue({
        pluginId: 'old-active',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '旧审核插件',
        meta: { provider: 'old' },
        secretSchema: {}
      });

      const snapshot = await captureModerationConfigAuditSnapshot({
        operator,
        pluginId: 'new-active'
      });
      await recordModerationConfigAudit({
        operator,
        snapshot,
        pluginId: 'new-active',
        pluginName: '新审核插件',
        secretsUpdated: true,
        nextEnabled: true
      });

      const logs = await MongoTeamAudit.find({}).sort({ _id: 1 }).lean();
      expect(logs.map((item) => ({ event: item.event, metadata: item.metadata }))).toEqual([
        {
          event: AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG,
          metadata: { pluginName: '新审核插件' }
        },
        {
          event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
          metadata: { pluginName: '旧审核插件' }
        },
        {
          event: AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN,
          metadata: { pluginName: '新审核插件' }
        }
      ]);
      expect(JSON.stringify(logs)).not.toContain('secret');
      expect(JSON.stringify(logs)).not.toContain('apiKey');
    });

    it('logs disablement when nextEnabled is false on a previously enabled plugin and handles snapshot errors', async () => {
      await MongoSystemModerationPlugin.create({
        pluginId: 'active-plugin',
        source: 'system',
        enabled: true
      });

      const snapshot = await captureModerationConfigAuditSnapshot({
        operator,
        pluginId: 'active-plugin'
      });
      await recordModerationConfigAudit({
        operator,
        snapshot,
        pluginId: 'active-plugin',
        pluginName: '生效插件',
        secretsUpdated: false,
        nextEnabled: false
      });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
        metadata: { pluginName: '生效插件' }
      });

      expect(
        await captureModerationConfigAuditSnapshot({
          operator: undefined,
          pluginId: 'active-plugin'
        })
      ).toBeUndefined();

      await recordModerationConfigAudit({
        operator: undefined,
        pluginId: 'active-plugin',
        secretsUpdated: true
      });
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'active-plugin',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '远程解析名称',
        meta: { provider: 'custom' },
        secretSchema: {}
      });
      await recordModerationConfigAudit({
        operator,
        pluginId: 'active-plugin',
        secretsUpdated: true
      });
      const updatedLogs = await MongoTeamAudit.find({
        event: AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_PLUGIN_CONFIG
      }).lean();
      expect(updatedLogs).toHaveLength(1);
      expect(updatedLogs[0].metadata).toEqual({ pluginName: '远程解析名称' });

      vi.spyOn(moderationEntity, 'findModerationConfig').mockRejectedValueOnce(new Error('boom'));
      await expect(
        captureModerationConfigAuditSnapshot({ operator, pluginId: 'active-plugin' })
      ).resolves.toBeUndefined();
    });
  });

  describe('captureModerationUninstallAuditSnapshot & recordModerationUninstallAudit', () => {
    it('logs both disable and uninstall when uninstalling the last active moderation plugin', async () => {
      await MongoSystemModerationPlugin.create({
        pluginId: 'last-plugin',
        source: 'system',
        enabled: true
      });
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'last-plugin',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '唯一审核插件',
        meta: { provider: 'keyword' },
        secretSchema: {}
      });

      const snapshot = await captureModerationUninstallAuditSnapshot({
        operator,
        pluginId: 'last-plugin'
      });
      await recordModerationUninstallAudit({
        operator,
        pluginId: 'last-plugin',
        snapshot
      });

      const logs = await MongoTeamAudit.find({}).sort({ _id: 1 }).lean();
      expect(logs.map((item) => ({ event: item.event, metadata: item.metadata }))).toEqual([
        {
          event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
          metadata: { pluginName: '唯一审核插件' }
        },
        {
          event: AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN,
          metadata: { pluginName: '唯一审核插件' }
        }
      ]);
    });

    it('logs only uninstall for an inactive plugin and falls back to pluginId on snapshot error', async () => {
      expect(
        await captureModerationUninstallAuditSnapshot({
          operator: undefined,
          pluginId: 'inactive-plugin'
        })
      ).toBeUndefined();

      vi.spyOn(moderationEntity, 'findModerationConfig').mockRejectedValueOnce(new Error('db err'));
      const fallbackSnapshot = await captureModerationUninstallAuditSnapshot({
        operator,
        pluginId: 'inactive-plugin'
      });
      expect(fallbackSnapshot).toEqual({
        wasEnabled: false,
        pluginName: 'inactive-plugin'
      });

      await recordModerationUninstallAudit({
        operator: undefined,
        pluginId: 'inactive-plugin'
      });
      await recordModerationUninstallAudit({
        operator,
        pluginId: 'inactive-plugin',
        snapshot: fallbackSnapshot
      });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN,
        metadata: { pluginName: 'inactive-plugin' }
      });
    });
  });

  describe('recordModerationRestoreAudit & recordInstalledModerationPluginsAudit', () => {
    it('logs install event when restoring a soft-uninstalled moderation plugin', async () => {
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValueOnce({
        pluginId: 'restored-plugin',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '恢复的审核插件',
        meta: { provider: 'keyword' },
        secretSchema: {}
      });

      await recordModerationRestoreAudit({
        operator: undefined,
        pluginId: 'restored-plugin'
      });
      expect(await MongoTeamAudit.countDocuments({})).toBe(0);

      await recordModerationRestoreAudit({
        operator,
        pluginId: 'restored-plugin'
      });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN,
        metadata: { pluginName: '恢复的审核插件' }
      });
    });

    it('logs install events only for moderation plugins and ignores tool plugins or remote list failures', async () => {
      vi.spyOn(remoteModeration, 'listModerationPlugins').mockResolvedValueOnce([
        {
          pluginId: 'keyword-moderation',
          source: 'system',
          version: '1.0.0',
          etag: 'etag-1',
          type: 'moderation',
          name: { 'zh-CN': '敏感词审核', en: 'Keyword Moderation' },
          icon: ''
        } as any
      ]);

      await recordInstalledModerationPluginsAudit({
        operator,
        pluginIds: ['weather-tool', 'keyword-moderation', 'keyword-moderation'],
        lang: 'zh-CN'
      });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_INSTALL_MODERATION_PLUGIN,
        metadata: { pluginName: '敏感词审核' }
      });

      // Empty or non-Throwing failure must not reject
      await recordInstalledModerationPluginsAudit({
        operator,
        pluginIds: []
      });
      vi.spyOn(remoteModeration, 'listModerationPlugins').mockRejectedValueOnce(
        new Error('plugin service offline')
      );
      await expect(
        recordInstalledModerationPluginsAudit({
          operator,
          pluginIds: ['keyword-moderation']
        })
      ).resolves.toBeUndefined();
    });
  });
});
