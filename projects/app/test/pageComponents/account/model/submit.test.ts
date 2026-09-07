import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postSystemModel: vi.fn(),
  putReplaceSystemModelChannels: vi.fn(),
  putSystemModel: vi.fn()
}));

vi.mock('@/web/core/ai/config', () => mocks);

import {
  prepareDraftSystemModelForTest,
  submitCreatedSystemModel,
  submitUpdatedSystemModel
} from '@/pageComponents/account/model/submit';
import {
  normalizeModelPricingForRead,
  normalizeModelPricingForSave
} from '@fastgpt/global/core/ai/pricing';

const modelData = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'controller-test-model',
  name: 'Controller test model',
  scope: ModelScopeEnum.system,
  isActive: false,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

describe('admin model submit controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postSystemModel.mockResolvedValue({ modelId: '68ad85a7463006c963799a05' });
    mocks.putReplaceSystemModelChannels.mockResolvedValue(undefined);
    mocks.putSystemModel.mockResolvedValue(undefined);
  });

  it('uses only POST create for a new model and sends no modelId', async () => {
    await submitCreatedSystemModel({ modelData, channelIds: [] });

    expect(mocks.postSystemModel).toHaveBeenCalledWith({
      modelData: { ...modelData, priceTiers: [] },
      channelIds: []
    });
    expect(mocks.putSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).not.toHaveBeenCalled();
    expect(mocks.postSystemModel.mock.calls[0]?.[0].modelData).not.toHaveProperty('modelId');
  });

  it('preserves the complete current draft when preparing a channel test', () => {
    const draft = {
      type: ModelTypeEnum.tts,
      provider: 'Custom provider',
      model: '  draft-tts  ',
      name: 'Draft alias',
      scope: ModelScopeEnum.system,
      isActive: false,
      requestUrl: 'https://draft.example.com/audio',
      requestAuth: 'draft-secret',
      config: { voices: [{ label: 'Alloy', value: 'alloy' }] }
    } as const;

    expect(prepareDraftSystemModelForTest(draft)).toEqual({
      ...draft,
      model: 'draft-tts'
    });
  });

  it('submits config and channels together without a separate external mutation', async () => {
    const modelId = '68ad85a7463006c963799a05';

    await submitUpdatedSystemModel({ modelId, modelData, channelIds: [2, 7] });

    expect(mocks.postSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).not.toHaveBeenCalled();
    expect(mocks.putSystemModel).toHaveBeenCalledWith({
      modelId,
      channelIds: [2, 7],
      modelData: expect.not.objectContaining({ model: expect.anything() })
    });
  });

  it('rejects an invalid edited alias before sending any mutation', async () => {
    await expect(
      submitUpdatedSystemModel({
        modelId: '68ad85a7463006c963799a05',
        modelData: { ...modelData, name: '   ' },
        channelIds: [2]
      })
    ).rejects.toBeDefined();
    expect(mocks.putSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).not.toHaveBeenCalled();
  });
});

describe('normalizeModelPricingForRead', () => {
  it.each([
    { inputPrice: 1, outputPrice: 3 },
    { inputPrice: 0, outputPrice: 3 },
    { charsPointsPrice: 2 }
  ])('converts legacy LLM pricing without retaining old fields: %j', (pricing) => {
    const original = { ...modelData, ...pricing };
    const result = normalizeModelPricingForRead(original);
    expect(result.priceTiers).toEqual([
      {
        minInputTokens: 0,
        inputPrice: 'charsPointsPrice' in pricing ? pricing.charsPointsPrice : pricing.inputPrice,
        outputPrice: 'charsPointsPrice' in pricing ? pricing.charsPointsPrice : pricing.outputPrice
      }
    ]);
    for (const key of ['inputPrice', 'outputPrice', 'charsPointsPrice']) {
      expect(result).not.toHaveProperty(key);
    }
    expect(original).toEqual({ ...modelData, ...pricing });
  });

  it('keeps current tiers ahead of legacy fields', () => {
    const priceTiers = [{ minInputTokens: 0, inputPrice: 2, outputPrice: 4 }];
    expect(
      normalizeModelPricingForRead({ ...modelData, priceTiers, inputPrice: 10, outputPrice: 20 })
        .priceTiers
    ).toEqual(priceTiers);
  });
});

describe('normalizeModelPricingForSave', () => {
  it('persists a free edit without falling back to the legacy prices', async () => {
    const form = normalizeModelPricingForRead({ ...modelData, inputPrice: 1, outputPrice: 3 });
    form.priceTiers = [{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }];
    const saved = normalizeModelPricingForSave(form);
    expect(saved.priceTiers).toEqual([]);
    expect(saved).not.toHaveProperty('inputPrice');
    expect(saved).not.toHaveProperty('outputPrice');

    await submitUpdatedSystemModel({
      modelId: '68ad85a7463006c963799a05',
      modelData: form,
      channelIds: []
    });
    expect(mocks.putSystemModel.mock.calls.at(-1)?.[0].modelData).toMatchObject({ priceTiers: [] });
    expect(mocks.putSystemModel.mock.calls.at(-1)?.[0].modelData).not.toHaveProperty('inputPrice');
  });

  it('ignores stale legacy fields even if a caller still includes them in the save input', () => {
    const result = normalizeModelPricingForSave({
      ...modelData,
      charsPointsPrice: 9,
      inputPrice: 1,
      outputPrice: 3,
      priceTiers: []
    });
    expect(result).toEqual({ ...modelData, priceTiers: [] });
  });

  it.each([ModelTypeEnum.embedding, ModelTypeEnum.tts, ModelTypeEnum.stt, ModelTypeEnum.rerank])(
    'preserves the current non-LLM pricing for %s',
    (type) => {
      const model = { ...modelData, type, charsPointsPrice: 5, config: {} } as Parameters<
        typeof normalizeModelPricingForRead
      >[0];
      expect(normalizeModelPricingForRead(model)).toBe(model);
      expect(normalizeModelPricingForSave(model)).toBe(model);
    }
  );
});
