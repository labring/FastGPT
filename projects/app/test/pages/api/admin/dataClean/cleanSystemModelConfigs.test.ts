import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  default as cleanSystemModelConfigsApi,
  cleanSystemModelConfig,
  runCleanSystemModelConfigs
} from '@/pages/api/admin/dataClean/cleanSystemModelConfigs';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
  };
});

const baseLlmModel = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'dirty-model',
  name: 'Dirty Model',
  maxContext: 16000,
  maxResponse: 8000,
  quoteMaxToken: 12000
};

describe('cleanSystemModelConfig', () => {
  it('coerces known numeric strings and removes empty optional fields', () => {
    const result = cleanSystemModelConfig({
      model: ' clean-model ',
      metadata: {
        ...baseLlmModel,
        charsPointsPrice: '',
        maxContext: '32000',
        maxResponse: '16000',
        quoteMaxToken: '24000',
        maxTemperature: '1.2'
      }
    });

    expect(result).toEqual({
      status: 'valid',
      changed: true,
      metadata: expect.objectContaining({
        model: 'clean-model',
        maxContext: 32000,
        maxResponse: 16000,
        quoteMaxToken: 24000,
        maxTemperature: 1.2
      })
    });
    if (result.status === 'valid') {
      expect(result.metadata).not.toHaveProperty('charsPointsPrice');
      expect(result.metadata).not.toHaveProperty('functionCall');
    }
  });

  it('parses JSON price tiers and fills the embedding weight default', () => {
    const result = cleanSystemModelConfig({
      model: 'embedding-model',
      metadata: {
        type: ModelTypeEnum.embedding,
        provider: 'OpenAI',
        model: 'embedding-model',
        name: 'Embedding Model',
        defaultToken: '500',
        maxToken: '3000',
        priceTiers: JSON.stringify([
          {
            minInputTokens: '0',
            maxInputTokens: '100',
            inputPrice: '0.1',
            outputPrice: '0.2'
          }
        ])
      }
    });

    expect(result).toEqual({
      status: 'valid',
      changed: true,
      metadata: expect.objectContaining({
        weight: 0,
        defaultToken: 500,
        maxToken: 3000,
        priceTiers: [
          {
            minInputTokens: 0,
            maxInputTokens: 100,
            inputPrice: 0.1,
            outputPrice: 0.2
          }
        ]
      })
    });
  });

  it('removes invalid optional numbers and defaults invalid required numbers', () => {
    const result = cleanSystemModelConfig({
      model: 'invalid-number-model',
      metadata: {
        ...baseLlmModel,
        maxContext: 'invalid',
        maxTemperature: 'invalid'
      }
    });

    expect(result).toMatchObject({
      status: 'valid',
      metadata: { maxContext: 16000 }
    });
    if (result.status === 'valid') {
      expect(result.metadata).not.toHaveProperty('maxTemperature');
    }
  });

  it('rejects records without a usable model and metadata object', () => {
    expect(cleanSystemModelConfig({ model: null, metadata: null })).toEqual({
      status: 'invalid',
      issues: [{ path: [], message: 'model and metadata are required' }]
    });
  });
});

describe('runCleanSystemModelConfigs', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoSystemModel.deleteMany({});
  });

  it('defaults to a non-destructive preview and updates only valid records when executed', async () => {
    await MongoSystemModel.collection.insertMany([
      {
        model: 'embedding-model',
        metadata: {
          type: ModelTypeEnum.embedding,
          provider: 'OpenAI',
          model: 'embedding-model',
          name: 'Embedding Model',
          defaultToken: '500',
          maxToken: '3000'
        }
      },
      {
        model: 'invalid-model',
        metadata: { ...baseLlmModel, model: 'invalid-model', type: 'unknown' }
      }
    ]);

    await expect(
      runCleanSystemModelConfigs({ dryRun: true, sampleLimit: 10 })
    ).resolves.toMatchObject({
      dryRun: true,
      scanned: 2,
      invalid: 1,
      wouldUpdate: 1,
      updated: 0,
      invalidSamples: [{ model: 'invalid-model' }]
    });
    expect(updatedReloadSystemModel).not.toHaveBeenCalled();
    await expect(
      MongoSystemModel.collection.findOne({ model: 'embedding-model' })
    ).resolves.toMatchObject({ metadata: { defaultToken: '500' } });

    await expect(
      runCleanSystemModelConfigs({ dryRun: false, sampleLimit: 10 })
    ).resolves.toMatchObject({
      dryRun: false,
      invalid: 1,
      updated: 1
    });
    expect(updatedReloadSystemModel).toHaveBeenCalledTimes(1);
    await expect(
      MongoSystemModel.findOne({ model: 'embedding-model' }).lean()
    ).resolves.toMatchObject({
      metadata: { defaultToken: 500, maxToken: 3000, weight: 0 }
    });
  });

  it('uses dry-run defaults at the authenticated API boundary', async () => {
    const root = await getRootUser();
    const res = await Call(cleanSystemModelConfigsApi, {
      auth: root,
      body: {}
    });

    expect(res).toMatchObject({
      code: 200,
      data: {
        dryRun: true,
        scanned: 0,
        updated: 0
      }
    });
  });
});
