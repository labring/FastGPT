import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';
import * as service from '../../../../core/plugin/moderation/service';
import * as fastgptPluginMod from '../../../../thirdProvider/fastgptPlugin/moderation';
import * as recordMod from '../../../../core/plugin/moderation/record/entity';
import {
  checkContentByPolicy,
  isModerationHookEnabled
} from '../../../../core/plugin/moderation/checker';

describe('moderation checker (checkContentByPolicy)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const basePolicy: SystemModerationPolicyType = {
    enabled: true,
    activePluginId: 'test-moderation',
    hooks: {
      userInput: true,
      modelInput: true,
      finalOutput: true
    },
    strategy: {
      streamInterval: 50,
      suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
      serviceExceptionAction: ModerationExceptionActionEnum.pass
    }
  };

  const mockRuntime = {
    pluginId: 'test-moderation',
    source: 'system',
    version: '1.0.0',
    secrets: { apiKey: 'secret' }
  };

  describe('isModerationHookEnabled', () => {
    it('returns false when policy is not enabled', () => {
      expect(
        isModerationHookEnabled({
          stage: ModerationStageEnum.entry,
          policy: { ...basePolicy, enabled: false }
        })
      ).toBe(false);
    });

    it('returns the corresponding hook value per stage', () => {
      const customPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        hooks: {
          userInput: true,
          modelInput: false,
          finalOutput: true
        }
      };

      expect(
        isModerationHookEnabled({ stage: ModerationStageEnum.entry, policy: customPolicy })
      ).toBe(true);
      expect(
        isModerationHookEnabled({ stage: ModerationStageEnum.modelInput, policy: customPolicy })
      ).toBe(false);
      expect(
        isModerationHookEnabled({ stage: ModerationStageEnum.output, policy: customPolicy })
      ).toBe(true);
    });
  });

  describe('short-circuit checks', () => {
    it('passes empty or whitespace-only text immediately', async () => {
      const pluginSpy = vi.spyOn(fastgptPluginMod, 'checkModerationContent');

      const res1 = await checkContentByPolicy({
        text: '',
        stage: ModerationStageEnum.entry,
        policy: basePolicy
      });
      const res2 = await checkContentByPolicy({
        text: '   ',
        stage: ModerationStageEnum.entry,
        policy: basePolicy
      });

      expect(res1.isPass).toBe(true);
      expect(res1.action).toBe(ModerationActionEnum.pass);
      expect(res2.isPass).toBe(true);
      expect(pluginSpy).not.toHaveBeenCalled();
    });

    it('passes immediately if policy is disabled', async () => {
      const pluginSpy = vi.spyOn(fastgptPluginMod, 'checkModerationContent');

      const res = await checkContentByPolicy({
        text: 'hello',
        stage: ModerationStageEnum.entry,
        policy: { ...basePolicy, enabled: false }
      });

      expect(res.isPass).toBe(true);
      expect(res.action).toBe(ModerationActionEnum.pass);
      expect(pluginSpy).not.toHaveBeenCalled();
    });

    it('passes immediately if hook for the stage is disabled', async () => {
      const pluginSpy = vi.spyOn(fastgptPluginMod, 'checkModerationContent');

      const res = await checkContentByPolicy({
        text: 'hello',
        stage: ModerationStageEnum.modelInput,
        policy: {
          ...basePolicy,
          hooks: { ...basePolicy.hooks, modelInput: false }
        }
      });

      expect(res.isPass).toBe(true);
      expect(res.action).toBe(ModerationActionEnum.pass);
      expect(pluginSpy).not.toHaveBeenCalled();
    });
  });

  describe('verdict evaluation', () => {
    it('passes when verdict is pass', async () => {
      vi.spyOn(service, 'getEnabledModerationRuntime').mockResolvedValue(mockRuntime);
      vi.spyOn(fastgptPluginMod, 'checkModerationContent').mockResolvedValue({
        verdict: 'pass',
        provider: 'test-provider',
        hits: []
      });
      const recordSpy = vi.spyOn(recordMod, 'recordModerationEvent').mockResolvedValue();

      const res = await checkContentByPolicy({
        text: 'normal query',
        stage: ModerationStageEnum.entry,
        policy: basePolicy
      });

      expect(res.isPass).toBe(true);
      expect(res.action).toBe(ModerationActionEnum.pass);
      expect(res.text).toBe('normal query');
      expect(res.verdict).toBe('pass');
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ModerationStageEnum.entry,
          verdict: 'pass',
          actionTaken: ModerationActionEnum.pass
        })
      );
    });

    it('blocks when verdict is block', async () => {
      vi.spyOn(service, 'getEnabledModerationRuntime').mockResolvedValue(mockRuntime);
      vi.spyOn(fastgptPluginMod, 'checkModerationContent').mockResolvedValue({
        verdict: 'block',
        provider: 'test-provider',
        hits: [{ label: 'violence', score: 99, keywords: ['kill'] }]
      });
      const recordSpy = vi.spyOn(recordMod, 'recordModerationEvent').mockResolvedValue();

      const res = await checkContentByPolicy({
        text: 'bad text',
        stage: ModerationStageEnum.entry,
        policy: basePolicy
      });

      expect(res.isPass).toBe(false);
      expect(res.action).toBe(ModerationActionEnum.block);
      expect(res.text).toBe('bad text');
      expect(res.keywords).toContain('kill');
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionTaken: ModerationActionEnum.block
        })
      );
    });

    it('handles suspected verdict according to suspectedRiskAction strategy', async () => {
      vi.spyOn(service, 'getEnabledModerationRuntime').mockResolvedValue(mockRuntime);
      vi.spyOn(fastgptPluginMod, 'checkModerationContent').mockResolvedValue({
        verdict: 'suspected',
        provider: 'test-provider',
        hits: [{ label: 'spam' }]
      });

      // 1. passAndLog: passes
      const passPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          suspectedRiskAction: ModerationRiskActionEnum.passAndLog
        }
      };
      const resPass = await checkContentByPolicy({
        text: 'suspected text',
        stage: ModerationStageEnum.entry,
        policy: passPolicy
      });
      expect(resPass.isPass).toBe(true);
      expect(resPass.action).toBe(ModerationActionEnum.pass);

      // 2. blockAndLog: blocks
      const blockPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          suspectedRiskAction: ModerationRiskActionEnum.blockAndLog
        }
      };
      const resBlock = await checkContentByPolicy({
        text: 'suspected text',
        stage: ModerationStageEnum.entry,
        policy: blockPolicy
      });
      expect(resBlock.isPass).toBe(false);
      expect(resBlock.action).toBe(ModerationActionEnum.block);
    });

    it('handles provider error verdict according to serviceExceptionAction strategy', async () => {
      vi.spyOn(service, 'getEnabledModerationRuntime').mockResolvedValue(mockRuntime);
      vi.spyOn(fastgptPluginMod, 'checkModerationContent').mockResolvedValue({
        verdict: 'error',
        provider: 'test-provider',
        errorMessage: 'provider rate limit'
      });

      // 1. serviceExceptionAction === pass -> passes
      const passPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          serviceExceptionAction: ModerationExceptionActionEnum.pass
        }
      };
      const resPass = await checkContentByPolicy({
        text: 'query',
        stage: ModerationStageEnum.entry,
        policy: passPolicy
      });
      expect(resPass.isPass).toBe(true);
      expect(resPass.action).toBe(ModerationActionEnum.pass);

      // 2. serviceExceptionAction === block -> blocks
      const blockPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          serviceExceptionAction: ModerationExceptionActionEnum.block
        }
      };
      const resBlock = await checkContentByPolicy({
        text: 'query',
        stage: ModerationStageEnum.entry,
        policy: blockPolicy
      });
      expect(resBlock.isPass).toBe(false);
      expect(resBlock.action).toBe(ModerationActionEnum.block);
    });
  });

  describe('service exception and runtime failures', () => {
    it('handles missing active moderation plugin', async () => {
      vi.spyOn(service, 'getEnabledModerationRuntime').mockResolvedValue(undefined);
      const recordSpy = vi.spyOn(recordMod, 'recordModerationEvent').mockResolvedValue();

      // Exception action = pass
      const passPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          serviceExceptionAction: ModerationExceptionActionEnum.pass
        }
      };
      const resPass = await checkContentByPolicy({
        text: 'query',
        stage: ModerationStageEnum.entry,
        policy: passPolicy
      });
      expect(resPass.isPass).toBe(true);
      expect(resPass.action).toBe(ModerationActionEnum.pass);
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          verdict: 'error',
          actionTaken: ModerationActionEnum.pass
        })
      );

      // Exception action = block
      const blockPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          serviceExceptionAction: ModerationExceptionActionEnum.block
        }
      };
      const resBlock = await checkContentByPolicy({
        text: 'query',
        stage: ModerationStageEnum.entry,
        policy: blockPolicy
      });
      expect(resBlock.isPass).toBe(false);
      expect(resBlock.action).toBe(ModerationActionEnum.block);
    });

    it('handles network or crash exception during checkModerationContent call', async () => {
      vi.spyOn(service, 'getEnabledModerationRuntime').mockResolvedValue(mockRuntime);
      vi.spyOn(fastgptPluginMod, 'checkModerationContent').mockRejectedValue(
        new Error('Network timeout')
      );
      const recordSpy = vi.spyOn(recordMod, 'recordModerationEvent').mockResolvedValue();

      // Exception action = block
      const blockPolicy: SystemModerationPolicyType = {
        ...basePolicy,
        strategy: {
          ...basePolicy.strategy,
          serviceExceptionAction: ModerationExceptionActionEnum.block
        }
      };
      const res = await checkContentByPolicy({
        text: 'query',
        stage: ModerationStageEnum.entry,
        policy: blockPolicy
      });

      expect(res.isPass).toBe(false);
      expect(res.action).toBe(ModerationActionEnum.block);
      expect(res.errorMessage).toBe('Network timeout');
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          verdict: 'error',
          errorMessage: 'Network timeout',
          actionTaken: ModerationActionEnum.block
        })
      );
    });
  });
});
