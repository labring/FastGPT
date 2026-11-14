vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

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

  describe('recordModerationPolicyAudit', () => {
    it('skips writes when operator lacks teamId or tmbId', async () => {
      await recordModerationPolicyAudit({
        operator: undefined,
        snapshot: { prevPolicy: DefaultSystemModerationPolicy },
        nextPolicy: DefaultSystemModerationPolicy
      });
      expect(await MongoTeamAudit.countDocuments({})).toBe(0);
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

      const { policy: nextPolicy, auditSnapshot: snapshot } =
        await moderationService.updateModerationPolicy({
          ...DefaultSystemModerationPolicy,
          enabled: true,
          activePluginId: 'baidu-moderation'
        });
      await recordModerationPolicyAudit({ operator, snapshot, nextPolicy });

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

      const { policy: nextPolicy, auditSnapshot: snapshot } =
        await moderationService.updateModerationPolicy({
          enabled: true,
          activePluginId: 'aliyun-moderation',
          hooks: {
            ...DefaultSystemModerationPolicy.hooks,
            modelInput: !DefaultSystemModerationPolicy.hooks.modelInput
          },
          strategy: DefaultSystemModerationPolicy.strategy
        });
      await recordModerationPolicyAudit({ operator, snapshot, nextPolicy });

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

      const { policy: nextPolicy, auditSnapshot: snapshot } =
        await moderationService.updateModerationPolicy({
          ...DefaultSystemModerationPolicy,
          enabled: false
        });
      await recordModerationPolicyAudit({ operator, snapshot, nextPolicy });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
        metadata: { pluginName: '百度内容审核' }
      });
    });
  });

  describe('recordModerationConfigAudit', () => {
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

      const snapshot = { prevTargetEnabled: false, prevActivePluginId: 'old-active' };
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

    it('logs disablement and resolves names without exposing credentials', async () => {
      await MongoSystemModerationPlugin.create({
        pluginId: 'active-plugin',
        source: 'system',
        enabled: true
      });

      const snapshot = { prevTargetEnabled: true, prevActivePluginId: 'active-plugin' };
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
    });
  });

  describe('committed mutation audit snapshots', () => {
    it.each(['policy', 'config'] as const)(
      'records both A→B→A transitions after concurrent %s transactions read A',
      async (entry) => {
        const originalPolicy = {
          ...DefaultSystemModerationPolicy,
          enabled: true,
          activePluginId: 'A'
        };
        await MongoSystemConfigs.create({
          type: SystemConfigsTypeEnum.moderationPolicy,
          value: originalPolicy
        });
        await MongoSystemModerationPlugin.create([
          { pluginId: 'A', source: 'system', enabled: true },
          { pluginId: 'B', source: 'system', enabled: false }
        ]);
        vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockImplementation(
          async ({ pluginId }) => ({
            pluginId,
            source: 'system',
            version: '1.0.0',
            type: 'moderation',
            name: pluginId,
            meta: { provider: 'test' },
            secretSchema: {}
          })
        );
        vi.spyOn(remoteModeration, 'checkModerationContent').mockResolvedValue({
          verdict: 'pass',
          provider: 'test',
          hits: [],
          keywords: []
        });

        const firstRead = Promise.withResolvers<void>();
        const bothRead = Promise.withResolvers<void>();
        const firstCommitted = Promise.withResolvers<void>();
        const findEnabled = moderationEntity.findEnabledModerationConfig;
        let reads = 0;
        // 两个事务先读到 A，再放行 B 的提交；A 的旧事务必须发生写冲突并重新读取 B。
        vi.spyOn(moderationEntity, 'findEnabledModerationConfig').mockImplementation(
          async (session) => {
            const config = await findEnabled(session);
            const read = ++reads;
            if (read <= 2) {
              expect(session?.inTransaction()).toBe(true);
              expect(config?.pluginId).toBe('A');
              if (read === 1) {
                firstRead.resolve();
                await bothRead.promise;
              } else {
                bothRead.resolve();
                await firstCommitted.promise;
              }
            }
            return config;
          }
        );

        // 使用真实事务与审计库，只替换远端插件元数据及配置探测。
        const mutateAndAudit = async (pluginId: string) => {
          if (entry === 'policy') {
            const { policy, auditSnapshot } = await moderationService.updateModerationPolicy({
              ...originalPolicy,
              activePluginId: pluginId,
              hooks: { ...originalPolicy.hooks, modelInput: pluginId === 'A' }
            });
            await recordModerationPolicyAudit({
              operator,
              snapshot: auditSnapshot,
              nextPolicy: policy
            });
          } else {
            const { item, auditSnapshot } = await moderationService.saveModerationConfig({
              pluginId,
              enabled: true
            });
            await recordModerationConfigAudit({
              operator,
              snapshot: auditSnapshot,
              pluginId,
              pluginName: item.name,
              secretsUpdated: false,
              nextEnabled: true
            });
          }
        };
        const first = mutateAndAudit('B').finally(() => firstCommitted.resolve());
        await firstRead.promise;
        await Promise.all([first, mutateAndAudit('A')]);

        expect(reads).toBeGreaterThanOrEqual(3);
        expect(await moderationService.getModerationPolicy()).toEqual(originalPolicy);
        expect(await MongoSystemModerationPlugin.find({ enabled: true }).lean()).toMatchObject([
          { pluginId: 'A' }
        ]);
        const disable = AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN;
        const enable = AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN;
        const policyUpdate = AdminAuditEventEnum.ADMIN_UPDATE_MODERATION_POLICY;
        const logs = await MongoTeamAudit.find({}).sort({ _id: 1 }).lean();
        expect(logs.map(({ event, metadata }) => ({ event, metadata }))).toEqual([
          { event: disable, metadata: { pluginName: 'A' } },
          { event: enable, metadata: { pluginName: 'B' } },
          ...(entry === 'policy' ? [{ event: policyUpdate, metadata: undefined }] : []),
          { event: disable, metadata: { pluginName: 'B' } },
          { event: enable, metadata: { pluginName: 'A' } },
          ...(entry === 'policy' ? [{ event: policyUpdate, metadata: undefined }] : [])
        ]);
      }
    );
  });

  describe('deleteModerationPlugin & recordModerationUninstallAudit', () => {
    it('logs both disable and uninstall when uninstalling the last active moderation plugin', async () => {
      await moderationService.updateModerationPolicy({
        ...DefaultSystemModerationPolicy,
        enabled: true,
        activePluginId: 'last-plugin'
      });
      vi.spyOn(remoteModeration, 'listModerationPlugins').mockResolvedValueOnce([
        {
          pluginId: 'last-plugin',
          source: 'system',
          version: '1.0.0',
          etag: 'etag-last',
          type: 'moderation',
          name: '唯一审核插件',
          icon: ''
        } as any
      ]);
      vi.spyOn(lifecycle, 'disableSystemPlugin').mockResolvedValueOnce(undefined);
      vi.spyOn(lifecycle, 'getRetainedModerationDetail').mockResolvedValueOnce({
        pluginId: 'last-plugin',
        source: 'system',
        version: '1.0.0',
        type: 'moderation',
        name: '唯一审核插件',
        meta: { provider: 'keyword' },
        secretSchema: {}
      });

      const { auditSnapshot } = await moderationService.deleteModerationPlugin({
        pluginId: 'last-plugin',
        source: 'system'
      });
      await recordModerationUninstallAudit({
        operator,
        pluginId: 'last-plugin',
        source: 'system',
        snapshot: auditSnapshot
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

    it('logs only uninstall for an inactive plugin and skips logging when operator or snapshot is missing', async () => {
      await recordModerationUninstallAudit({
        operator: undefined,
        pluginId: 'inactive-plugin',
        snapshot: { wasEnabled: false }
      });
      await recordModerationUninstallAudit({
        operator,
        pluginId: 'inactive-plugin'
      });
      expect(await MongoTeamAudit.countDocuments({})).toBe(0);

      vi.spyOn(lifecycle, 'getRetainedModerationDetail').mockRejectedValueOnce(new Error('pruned'));
      vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockRejectedValueOnce(
        new Error('missing')
      );
      await recordModerationUninstallAudit({
        operator,
        pluginId: 'inactive-plugin',
        snapshot: { wasEnabled: false }
      });

      const logs = await MongoTeamAudit.find({}).lean();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN,
        metadata: { pluginName: 'inactive-plugin' }
      });
    });

    it.each(['preTransaction', 'inTransaction'] as const)(
      'logs ENABLE, DISABLE and UNINSTALL when another request enables the last inactive plugin during %s uninstall window',
      async (windowMode) => {
        await MongoSystemModerationPlugin.create({
          pluginId: 'A',
          source: 'system',
          enabled: false,
          deleted: false
        });
        await moderationService.updateModerationPolicy({
          ...DefaultSystemModerationPolicy,
          enabled: false,
          activePluginId: undefined
        });

        vi.spyOn(remoteModeration, 'listModerationPlugins').mockResolvedValue([
          {
            pluginId: 'A',
            source: 'system',
            version: '1.0.0',
            etag: 'etag-a',
            type: 'moderation',
            name: 'A',
            icon: ''
          } as any
        ]);
        vi.spyOn(remoteModeration, 'getModerationPluginDetail').mockResolvedValue({
          pluginId: 'A',
          source: 'system',
          version: '1.0.0',
          type: 'moderation',
          name: 'A',
          meta: { provider: 'test' },
          secretSchema: {}
        });
        vi.spyOn(lifecycle, 'getRetainedModerationDetail').mockResolvedValue({
          pluginId: 'A',
          source: 'system',
          version: '1.0.0',
          type: 'moderation',
          name: 'A',
          meta: { provider: 'test' },
          secretSchema: {}
        });
        vi.spyOn(remoteModeration, 'checkModerationContent').mockResolvedValue({
          verdict: 'pass',
          provider: 'test',
          hits: [],
          keywords: []
        });

        const uninstallPaused = Promise.withResolvers<void>();
        const concurrentEnableDone = Promise.withResolvers<void>();
        let inTxReads = 0;

        if (windowMode === 'preTransaction') {
          // 卸载预检读到 enabled=false 后、进入数据库事务前，另一请求启用最后插件 A。
          vi.spyOn(lifecycle, 'disableSystemPlugin').mockImplementationOnce(async () => {
            uninstallPaused.resolve();
            await concurrentEnableDone.promise;
          });
        } else {
          vi.spyOn(lifecycle, 'disableSystemPlugin').mockResolvedValueOnce(undefined);
          const originalFindConfig = moderationEntity.findModerationConfig;
          // 卸载事务内首次读到 enabled=false 后暂停，另一事务提交启用 A，触发写冲突重试并重读 enabled=true。
          vi.spyOn(moderationEntity, 'findModerationConfig').mockImplementation(
            async (query, session) => {
              const record = await originalFindConfig(query, session);
              if (session?.inTransaction() && query.pluginId === 'A') {
                const readIndex = ++inTxReads;
                if (readIndex === 1) {
                  expect(record?.enabled).toBe(false);
                  uninstallPaused.resolve();
                  await concurrentEnableDone.promise;
                }
              }
              return record;
            }
          );
        }

        const uninstallTask = (async () => {
          const { auditSnapshot } = await moderationService.deleteModerationPlugin({
            pluginId: 'A',
            source: 'system'
          });
          await recordModerationUninstallAudit({
            operator,
            pluginId: 'A',
            source: 'system',
            snapshot: auditSnapshot
          });
        })();

        await uninstallPaused.promise;

        const { item, auditSnapshot: enableSnapshot } =
          await moderationService.saveModerationConfig({
            pluginId: 'A',
            enabled: true
          });
        await recordModerationConfigAudit({
          operator,
          snapshot: enableSnapshot,
          pluginId: 'A',
          pluginName: item.name,
          secretsUpdated: false,
          nextEnabled: true
        });
        concurrentEnableDone.resolve();

        await uninstallTask;

        if (windowMode === 'inTransaction') {
          expect(inTxReads).toBeGreaterThanOrEqual(2);
        }
        expect(
          await MongoSystemModerationPlugin.findOne({ pluginId: 'A', source: 'system' }).lean()
        ).toMatchObject({
          deleted: true,
          enabled: false
        });
        expect(await moderationService.getModerationPolicy()).toMatchObject({
          enabled: false,
          activePluginId: undefined
        });

        const logs = await MongoTeamAudit.find({}).sort({ _id: 1 }).lean();
        expect(logs.map(({ event, metadata }) => ({ event, metadata }))).toEqual([
          {
            event: AdminAuditEventEnum.ADMIN_ENABLE_MODERATION_PLUGIN,
            metadata: { pluginName: 'A' }
          },
          {
            event: AdminAuditEventEnum.ADMIN_DISABLE_MODERATION_PLUGIN,
            metadata: { pluginName: 'A' }
          },
          {
            event: AdminAuditEventEnum.ADMIN_UNINSTALL_MODERATION_PLUGIN,
            metadata: { pluginName: 'A' }
          }
        ]);
      }
    );
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
