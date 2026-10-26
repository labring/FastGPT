import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { normalizeModelPricingForSave } from '@fastgpt/global/core/ai/model/pricing';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import { pushAudioSpeechUsage } from '@/service/support/wallet/usage/push';

afterEach(() => vi.unstubAllGlobals());

describe('pushAudioSpeechUsage character pricing', () => {
  it.each(['paid', 'free'] as const)(
    'records the correct fee for %s character prices',
    async (mode) => {
      const source = {
        type: ModelTypeEnum.tts as const,
        model: 'tts-unit',
        name: 'TTS unit',
        provider: 'openai',
        scope: ModelScopeEnum.system,
        config: { voices: [{ label: 'Default', value: 'default' }] },
        pricing: { unitPrice: mode === 'free' ? 0 : 125 }
      };
      const saved = await MongoAIModel.create(normalizeModelPricingForSave(source));
      const model = formatDbModelToRuntimeModel(saved.toObject(), { fallbackProvider: true });
      if (model.type !== ModelTypeEnum.tts) throw new Error('Expected TTS model');
      const createUsage = vi.fn();
      vi.stubGlobal('createUsageHandler', createUsage);

      pushAudioSpeechUsage({
        model,
        charsLength: 1000000,
        teamId: '507f1f77bcf86cd799439011',
        tmbId: '507f1f77bcf86cd799439012',
        source: UsageSourceEnum.fastgpt
      });
      const totalPoints = mode === 'free' ? 0 : 125;
      expect(createUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          totalPoints,
          list: [
            expect.objectContaining({
              amount: totalPoints,
              modelId: model.modelId,
              charsLength: 1000000
            })
          ]
        })
      );
    }
  );
});
