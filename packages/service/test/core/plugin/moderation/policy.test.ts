import { describe, expect, it, vi, afterEach } from 'vitest';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
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
      vi.spyOn(MongoSystemConfigs, 'findOne').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(null)
        })
      } as any);
      vi.spyOn(entity, 'findEnabledModerationConfig').mockResolvedValue(null);

      const policy = await getModerationPolicy();

      expect(policy).toEqual(DefaultSystemModerationPolicy);
      expect(policy.enabled).toBe(false);
    });

    it('returns stored policy and aligns enabled state with active plugin', async () => {
      vi.spyOn(MongoSystemConfigs, 'findOne').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            value: {
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
  });

  describe('updateModerationPolicy', () => {
    it('enables the active plugin when policy is enabled', async () => {
      const upsertSpy = vi.spyOn(MongoSystemConfigs, 'findOneAndUpdate').mockResolvedValue({} as any);
      const enableSpy = vi.spyOn(entity, 'enableSingleModerationConfig').mockResolvedValue(undefined);
      const disableSpy = vi.spyOn(entity, 'disableAllModerationConfigs').mockResolvedValue({} as any);

      const updated = await updateModerationPolicy({
        enabled: true,
        activePluginId: 'aliyun-moderation',
        hooks: { userInput: true, modelInput: false, finalOutput: true },
        strategy: {
          streamInterval: 60,
          suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
          serviceExceptionAction: ModerationExceptionActionEnum.pass
        }
      });

      expect(enableSpy).toHaveBeenCalledWith({ pluginId: 'aliyun-moderation' });
      expect(disableSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
      expect(updated.activePluginId).toBe('aliyun-moderation');
    });

    it('disables all plugins when policy is disabled', async () => {
      vi.spyOn(MongoSystemConfigs, 'findOneAndUpdate').mockResolvedValue({} as any);
      const enableSpy = vi.spyOn(entity, 'enableSingleModerationConfig').mockResolvedValue(undefined);
      const disableSpy = vi.spyOn(entity, 'disableAllModerationConfigs').mockResolvedValue({} as any);

      const updated = await updateModerationPolicy({
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
  });
});
