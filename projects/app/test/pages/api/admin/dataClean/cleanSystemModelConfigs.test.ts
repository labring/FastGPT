import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  default as cleanSystemModelConfigsApi,
  cleanSystemModelConfig,
  runCleanSystemModelConfigs
} from '@/pages/api/admin/dataClean/cleanSystemModelConfigs';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import {
  getPluginSystemModelDocuments,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    getPluginSystemModelDocuments: vi.fn().mockResolvedValue([]),
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
      document: expect.objectContaining({
        model: 'clean-model',
        isSystem: true,
        config: expect.objectContaining({
          maxContext: 32000,
          maxResponse: 16000,
          quoteMaxToken: 24000,
          maxTemperature: 1.2
        })
      })
    });
    if (result.status === 'valid') {
      expect(result.document).not.toHaveProperty('charsPointsPrice');
      expect(result.document.config).not.toHaveProperty('functionCall');
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
      document: expect.objectContaining({
        priceTiers: [
          {
            minInputTokens: 0,
            maxInputTokens: 100,
            inputPrice: 0.1,
            outputPrice: 0.2
          }
        ],
        config: expect.objectContaining({
          weight: 0,
          defaultToken: 500,
          maxToken: 3000
        })
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
      document: { config: { maxContext: 16000 } }
    });
    if (result.status === 'valid') {
      expect(result.document.config).not.toHaveProperty('maxTemperature');
    }
  });

  it('removes empty price tiers and coerces TTS price strings', () => {
    const result = cleanSystemModelConfig({
      model: 'speech-model',
      metadata: {
        type: ModelTypeEnum.tts,
        provider: 'MiniMax',
        model: 'speech-model',
        name: 'Speech Model',
        charsPointsPrice: '20.00',
        priceTiers: '',
        voices: []
      }
    });

    expect(result).toMatchObject({
      status: 'valid',
      changed: true,
      document: { charsPointsPrice: 20 }
    });
    if (result.status === 'valid') {
      expect(result.document).not.toHaveProperty('priceTiers');
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
    vi.mocked(getPluginSystemModelDocuments).mockResolvedValue([]);
    await Promise.all([
      MongoSystemModel.deleteMany({}),
      MongoDataset.deleteMany({}),
      MongoEvaluation.deleteMany({}),
      MongoResourcePermission.deleteMany({ resourceType: PerResourceTypeEnum.model }),
      MongoApp.deleteMany({}),
      MongoAppVersion.deleteMany({}),
      MongoAppTemplate.deleteMany({}),
      MongoUsageItem.deleteMany({})
    ]);
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

    await expect(runCleanSystemModelConfigs({ dryRun: true })).resolves.toMatchObject({
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

    await expect(runCleanSystemModelConfigs({ dryRun: false })).resolves.toMatchObject({
      dryRun: false,
      invalid: 1,
      updated: 1
    });
    expect(updatedReloadSystemModel).toHaveBeenCalledTimes(1);
    await expect(
      MongoSystemModel.findOne({ model: 'embedding-model' }).lean()
    ).resolves.toMatchObject({
      isSystem: true,
      config: { defaultToken: 500, maxToken: 3000, weight: 0 }
    });
    await expect(
      MongoSystemModel.collection.findOne({ model: 'embedding-model' })
    ).resolves.toHaveProperty('metadata');

    await expect(runCleanSystemModelConfigs({ dryRun: false })).resolves.toMatchObject({
      dryRun: false,
      updated: 0
    });
    expect(updatedReloadSystemModel).toHaveBeenCalledTimes(2);
  });

  it('returns all invalid records without a sample limit', async () => {
    await MongoSystemModel.collection.insertMany(
      Array.from({ length: 25 }, (_, index) => ({
        model: `invalid-model-${index}`,
        metadata: { ...baseLlmModel, model: `invalid-model-${index}`, type: 'unknown' }
      }))
    );

    const result = await runCleanSystemModelConfigs({ dryRun: true });

    expect(result.invalid).toBe(25);
    expect(result.invalidSamples).toHaveLength(25);
  });

  it('backfills ID siblings without deleting legacy fields or rewriting usage history', async () => {
    const modelInsert = await MongoSystemModel.collection.insertOne({
      model: 'gpt-model',
      metadata: {
        ...baseLlmModel,
        model: 'gpt-model',
        name: 'GPT Model'
      }
    });
    const legacyInput = {
      key: NodeInputKeyEnum.aiModel,
      value: 'gpt-model',
      valueType: 'string'
    };
    const dynamicInput = {
      key: NodeInputKeyEnum.datasetSearchExtensionModel,
      value: '{{model}}',
      valueType: 'string'
    };

    await Promise.all([
      MongoDataset.collection.insertOne({
        name: 'Dataset',
        vectorModel: 'gpt-model',
        agentModel: 'gpt-model'
      }),
      MongoEvaluation.collection.insertOne({ evalModel: 'gpt-model' }),
      MongoResourcePermission.collection.insertOne({
        resourceType: PerResourceTypeEnum.model,
        resourceName: 'gpt-model'
      }),
      MongoApp.collection.insertOne({
        chatConfig: { questionGuide: { model: 'gpt-model' } },
        modules: [{ inputs: [legacyInput, dynamicInput] }]
      }),
      MongoAppVersion.collection.insertOne({
        chatConfig: { ttsConfig: { model: 'gpt-model' } },
        nodes: [{ inputs: [legacyInput] }]
      }),
      MongoAppTemplate.collection.insertOne({
        workflow: { nodes: [{ inputs: [legacyInput] }] }
      }),
      MongoUsageItem.collection.insertOne({ model: 'gpt-model' })
    ]);

    const preview = await runCleanSystemModelConfigs({ dryRun: true });
    expect(preview.references.datasets.wouldUpdate).toBe(1);
    expect(preview.references.appsWorkflow.wouldUpdate).toBe(1);
    await expect(MongoDataset.collection.findOne({ name: 'Dataset' })).resolves.not.toHaveProperty(
      'vectorModelId'
    );

    const result = await runCleanSystemModelConfigs({ dryRun: false });
    expect(result.references.datasets.updated).toBe(1);
    expect(result.references.modelPermissions.updated).toBe(1);

    await expect(MongoDataset.collection.findOne({ name: 'Dataset' })).resolves.toMatchObject({
      vectorModel: 'gpt-model',
      agentModel: 'gpt-model',
      vectorModelId: modelInsert.insertedId,
      agentModelId: modelInsert.insertedId
    });
    await expect(MongoEvaluation.collection.findOne({})).resolves.toMatchObject({
      evalModel: 'gpt-model',
      evalModelId: modelInsert.insertedId
    });
    await expect(
      MongoResourcePermission.collection.findOne({ resourceType: PerResourceTypeEnum.model })
    ).resolves.toMatchObject({
      resourceName: 'gpt-model',
      resourceId: modelInsert.insertedId
    });

    const app = await MongoApp.collection.findOne({});
    expect(app?.chatConfig.questionGuide).toMatchObject({
      model: 'gpt-model',
      modelId: String(modelInsert.insertedId)
    });
    expect(app?.modules[0].inputs).toEqual(
      expect.arrayContaining([
        legacyInput,
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: String(modelInsert.insertedId)
        }),
        dynamicInput
      ])
    );
    expect(app?.modules[0].inputs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.datasetSearchExtensionModelId })
      ])
    );

    await expect(MongoUsageItem.collection.findOne({})).resolves.toMatchObject({
      model: 'gpt-model'
    });
    await expect(MongoUsageItem.collection.findOne({})).resolves.not.toHaveProperty('modelId');
  });

  it('materializes plugin models before calculating reference backfills', async () => {
    vi.mocked(getPluginSystemModelDocuments).mockResolvedValue([
      {
        type: ModelTypeEnum.embedding,
        provider: 'OpenAI',
        model: 'plugin-embedding',
        name: 'Plugin Embedding',
        isSystem: true,
        config: { defaultToken: 500, maxToken: 3000, weight: 0 }
      }
    ]);
    await MongoDataset.collection.insertOne({
      name: 'Plugin Dataset',
      vectorModel: 'plugin-embedding'
    });

    const preview = await runCleanSystemModelConfigs({ dryRun: true });
    expect(preview.groups.models.wouldUpdate).toBe(1);
    expect(preview.groups.datasets.wouldUpdate).toBe(1);
    await expect(MongoSystemModel.collection.findOne({ model: 'plugin-embedding' })).resolves.toBe(
      null
    );

    const result = await runCleanSystemModelConfigs({ dryRun: false });
    expect(result.groups.models.updated).toBe(1);
    const materialized = await MongoSystemModel.collection.findOne({ model: 'plugin-embedding' });
    expect(materialized).toMatchObject({ isSystem: true });
    await expect(
      MongoDataset.collection.findOne({ name: 'Plugin Dataset' })
    ).resolves.toMatchObject({ vectorModelId: materialized?._id });
  });

  it('reports conflicting canonical and legacy references without overwriting the ID', async () => {
    const [legacyModel, canonicalModel] = await Promise.all([
      MongoSystemModel.collection.insertOne({
        model: 'legacy-model',
        metadata: { ...baseLlmModel, model: 'legacy-model' }
      }),
      MongoSystemModel.collection.insertOne({
        model: 'canonical-model',
        metadata: { ...baseLlmModel, model: 'canonical-model' }
      })
    ]);
    await MongoDataset.collection.insertOne({
      name: 'Conflict Dataset',
      agentModel: 'legacy-model',
      agentModelId: canonicalModel.insertedId
    });

    const result = await runCleanSystemModelConfigs({ dryRun: false });
    expect(result.groups.datasets.conflicts).toBe(1);
    await expect(
      MongoDataset.collection.findOne({ name: 'Conflict Dataset' })
    ).resolves.toMatchObject({
      agentModel: 'legacy-model',
      agentModelId: canonicalModel.insertedId
    });
    expect(String(legacyModel.insertedId)).not.toBe(String(canonicalModel.insertedId));
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
