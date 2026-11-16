import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { systemInstanceConfig } from '../../../../common/system/systemInstanceConfig/service';
import * as entity from '../../../../core/plugin/moderation/entity';
import {
  getModerationPolicy,
  updateModerationPolicy
} from '../../../../core/plugin/moderation/service';
import {
  ModerationRiskActionEnum,
  ModerationExceptionActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import { DefaultSystemModerationPolicy } from '@fastgpt/global/core/plugin/moderation/type';

describe('moderation policy service', () => {
  beforeEach(() => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getModerationPolicy', () => {
    it('reads defaults from the snapshot when no plugin is enabled', async () => {
      const findSpy = vi.spyOn(MongoSystemInstanceConfig, 'findOne');
      vi.spyOn(entity, 'findEnabledModerationConfig').mockResolvedValue(null);

      expect(await getModerationPolicy()).toEqual(DefaultSystemModerationPolicy);
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('uses the latest snapshot and gives an enabled plugin priority', async () => {
      getTestInstanceConfig().moderationPolicy = {
        enabled: true,
        activePluginId: 'saved-plugin',
        hooks: { userInput: true, modelInput: true, finalOutput: false },
        strategy: {
          streamInterval: 40,
          suspectedRiskAction: ModerationRiskActionEnum.passAndLog,
          serviceExceptionAction: ModerationExceptionActionEnum.block
        }
      };
      const enabledPlugin = vi.spyOn(entity, 'findEnabledModerationConfig').mockResolvedValue({
        pluginId: 'actual-plugin',
        enabled: true
      });

      const policy = await getModerationPolicy();
      expect(policy).toMatchObject({
        enabled: true,
        activePluginId: 'actual-plugin',
        strategy: { streamInterval: 40 }
      });
      enabledPlugin.mockResolvedValue(null);
      expect((await getModerationPolicy()).activePluginId).toBe('saved-plugin');
      getTestInstanceConfig().moderationPolicy.enabled = false;
      expect((await getModerationPolicy()).enabled).toBe(false);
    });
  });

  describe('updateModerationPolicy', () => {
    it.each([undefined, ''])(
      'rejects enabling without an active plugin (%s) before any writes',
      async (activePluginId) => {
        const upsertSpy = vi
          .spyOn(MongoSystemInstanceConfig, 'findOneAndUpdate')
          .mockResolvedValue({} as any);
        const enableSpy = vi
          .spyOn(entity, 'enableSingleModerationConfig')
          .mockResolvedValue(undefined);
        const disableSpy = vi
          .spyOn(entity, 'disableAllModerationConfigs')
          .mockResolvedValue({} as any);

        await expect(
          updateModerationPolicy({
            ...DefaultSystemModerationPolicy,
            enabled: true,
            activePluginId
          })
        ).rejects.toThrow('请选择一个审核插件后再保存');

        expect(upsertSpy).not.toHaveBeenCalled();
        expect(enableSpy).not.toHaveBeenCalled();
        expect(disableSpy).not.toHaveBeenCalled();
      }
    );

    it('enables the active plugin when policy is enabled', async () => {
      const upsertSpy = vi
        .spyOn(MongoSystemInstanceConfig, 'findOneAndUpdate')
        .mockResolvedValue({} as any);
      const enableSpy = vi
        .spyOn(entity, 'enableSingleModerationConfig')
        .mockResolvedValue(undefined);
      const disableSpy = vi
        .spyOn(entity, 'disableAllModerationConfigs')
        .mockResolvedValue({} as any);

      const { policy: updated } = await updateModerationPolicy({
        enabled: true,
        activePluginId: 'aliyun-moderation',
        hooks: { userInput: true, modelInput: false, finalOutput: true },
        strategy: {
          streamInterval: 60,
          suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
          serviceExceptionAction: ModerationExceptionActionEnum.pass
        }
      });

      expect(enableSpy).toHaveBeenCalledWith(
        expect.objectContaining({ pluginId: 'aliyun-moderation' })
      );
      expect(disableSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
      expect(updated.activePluginId).toBe('aliyun-moderation');
    });

    it('disables all plugins when policy is disabled', async () => {
      vi.spyOn(MongoSystemInstanceConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
      const enableSpy = vi
        .spyOn(entity, 'enableSingleModerationConfig')
        .mockResolvedValue(undefined);
      const disableSpy = vi
        .spyOn(entity, 'disableAllModerationConfigs')
        .mockResolvedValue({} as any);

      const { policy: updated } = await updateModerationPolicy({
        enabled: false,
        activePluginId: 'aliyun-moderation',
        hooks: { userInput: true, modelInput: false, finalOutput: true },
        strategy: {
          streamInterval: 50,
          suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
          serviceExceptionAction: ModerationExceptionActionEnum.pass
        }
      });

      expect(enableSpy).not.toHaveBeenCalled();
      expect(disableSpy).toHaveBeenCalled();
      expect(updated.enabled).toBe(false);
    });

    it('persists one policy record and increments its revision on every update', async () => {
      const { policy: updated } = await updateModerationPolicy({
        ...DefaultSystemModerationPolicy,
        enabled: false
      });
      expect(updated.enabled).toBe(false);

      const first = await MongoSystemInstanceConfig.findOne({ domain: 'moderationPolicy' }).lean();
      expect(first).toMatchObject({ revision: 1, overrides: { enabled: false } });

      await updateModerationPolicy({
        ...DefaultSystemModerationPolicy,
        hooks: { ...DefaultSystemModerationPolicy.hooks, finalOutput: false }
      });
      const second = await MongoSystemInstanceConfig.findOne({ domain: 'moderationPolicy' }).lean();
      expect(second).toMatchObject({
        _id: first?._id,
        revision: 2,
        overrides: { hooks: { finalOutput: false } }
      });
      expect((await getModerationPolicy()).hooks.finalOutput).toBe(false);
      expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'moderationPolicy' })).toBe(
        1
      );
    });

    it('keeps the committed policy when snapshot refresh fails', async () => {
      vi.spyOn(systemInstanceConfig, 'refresh').mockRejectedValueOnce(new Error('refresh failed'));
      const policy = {
        ...DefaultSystemModerationPolicy,
        hooks: { ...DefaultSystemModerationPolicy.hooks, finalOutput: false }
      };

      await expect(updateModerationPolicy(policy)).resolves.toMatchObject({ policy });
      const record = await MongoSystemInstanceConfig.findOne({ domain: 'moderationPolicy' }).lean();
      expect(record).toMatchObject({ revision: 1, overrides: { hooks: { finalOutput: false } } });
      expect((await getModerationPolicy()).hooks.finalOutput).toBe(true);
    });
  });
});
