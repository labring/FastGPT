import { describe, expect, it, vi, afterEach } from 'vitest';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getModerationPolicy', () => {
    it('returns default policy when no database record exists and no plugin is enabled', async () => {
      vi.spyOn(MongoSystemInstanceConfig, 'findOne').mockReturnValue({
        session: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null)
      } as any);
      vi.spyOn(entity, 'findEnabledModerationConfig').mockResolvedValue(null);

      const policy = await getModerationPolicy();

      expect(policy).toEqual(DefaultSystemModerationPolicy);
      expect(policy.enabled).toBe(false);
      expect(policy.hooks).toEqual({
        userInput: true,
        modelInput: true,
        finalOutput: true
      });
      expect(policy.strategy.streamInterval).toBe(100);
    });

    it('returns stored policy and aligns enabled state with active plugin', async () => {
      vi.spyOn(MongoSystemInstanceConfig, 'findOne').mockReturnValue({
        session: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({
          overrides: {
            enabled: true,
            activePluginId: 'baidu-moderation',
            hooks: { userInput: true, modelInput: true, finalOutput: false },
            strategy: {
              streamInterval: 40,
              suspectedRiskAction: ModerationRiskActionEnum.passAndLog,
              serviceExceptionAction: ModerationExceptionActionEnum.block
            }
          }
        })
      } as any);
      vi.spyOn(entity, 'findEnabledModerationConfig').mockResolvedValue({
        pluginId: 'baidu-moderation',
        enabled: true
      });

      const policy = await getModerationPolicy();

      expect(policy.enabled).toBe(true);
      expect(policy.activePluginId).toBe('baidu-moderation');
      expect(policy.hooks.modelInput).toBe(true);
      expect(policy.strategy.streamInterval).toBe(40);
    });

    it('falls back to defaults when the stored policy is invalid', async () => {
      vi.spyOn(MongoSystemInstanceConfig, 'findOne').mockReturnValue({
        session: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ overrides: { strategy: { streamInterval: 0 } } })
      } as any);
      vi.spyOn(entity, 'findEnabledModerationConfig').mockResolvedValue(null);

      expect(await getModerationPolicy()).toEqual(DefaultSystemModerationPolicy);
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
      expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'moderationPolicy' })).toBe(
        1
      );
    });
  });
});
