import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    refreshModelTemplates: vi.fn().mockResolvedValue([]),
    updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
  };
});

import updateWithJsonApi from '@/pages/api/admin/settings/model/updateWithJson';

const buildLlmConfig = ({ modelId, model = 'test-llm' }: { modelId: string; model?: string }) => ({
  modelId,
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: 'Test LLM',
  scope: 'system' as const,
  config: {
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000,
    toolChoice: true
  },
  isActive: true
});

const buildEmbeddingConfig = ({ modelId }: { modelId: string }) => ({
  modelId,
  model: 'test-embedding',
  type: ModelTypeEnum.embedding,
  provider: 'OpenAI',
  name: 'Test Embedding',
  scope: 'system' as const,
  config: {
    defaultToken: 500,
    maxToken: 3000,
    weight: 0
  },
  isActive: true
});

const buildStoredLlm = (model: string) => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: model,
  scope: 'system' as const,
  isActive: true,
  config: {
    maxContext: 8000,
    maxResponse: 4000,
    quoteMaxToken: 6000,
    toolChoice: true
  }
});

const callUpdateWithJson = async (config: string) => {
  const root = await getRootUser();
  return Call(updateWithJsonApi, { auth: root, body: { config } });
};

describe('admin settings model updateWithJson api', () => {
  it('updates matching IDs, creates external models by model and disables omitted records', async () => {
    const oldModel = await MongoSystemModel.create(buildStoredLlm('old-model'));
    const existingModel = await MongoSystemModel.create(buildStoredLlm('test-llm'));

    const res = await callUpdateWithJson(
      JSON.stringify([
        buildLlmConfig({ modelId: String(existingModel._id) }),
        buildEmbeddingConfig({ modelId: 'external-system-model-id' })
      ])
    );

    expect(res.code).toBe(200);
    const disabledModel = await MongoSystemModel.findById(oldModel._id).lean();
    expect(disabledModel?.isActive).toBe(false);
    const updatedModel = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(String(updatedModel?._id)).toBe(String(existingModel._id));
    expect(updatedModel).toMatchObject({
      scope: 'system',
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
    });
    const externalModel = await MongoSystemModel.findOne({ model: 'test-embedding' }).lean();
    expect(externalModel).toMatchObject({ scope: 'system', config: { weight: 0 } });
    expect(String(externalModel?._id)).not.toBe('external-system-model-id');
  });

  it('ignores old records without modelId and does not disable all models', async () => {
    const existing = await MongoSystemModel.create(buildStoredLlm('existing-model'));
    const res = await callUpdateWithJson(
      JSON.stringify([{ ...buildStoredLlm('legacy-model'), scope: undefined }])
    );

    expect(res.code).toBe(200);
    await expect(MongoSystemModel.findById(existing._id).lean()).resolves.toMatchObject({
      isActive: true
    });
    await expect(MongoSystemModel.findOne({ model: 'legacy-model' })).resolves.toBeNull();
  });

  it('reuses a target model ID when an external ID points to an existing provider model', async () => {
    const existing = await MongoSystemModel.create(buildStoredLlm('test-llm'));
    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig({ modelId: 'another-system-id' })])
    );

    expect(res.code).toBe(200);
    const updated = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(String(updated?._id)).toBe(String(existing._id));
    expect(updated?.config.maxContext).toBe(16000);
  });

  it('rejects malformed JSON as an input parse error', async () => {
    const res = await callUpdateWithJson('{invalid-json');

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects non-canonical latest records instead of repairing them', async () => {
    const config = buildLlmConfig({ modelId: 'external-id' });
    config.config.maxContext = '16000' as unknown as number;

    const res = await callUpdateWithJson(JSON.stringify([config]));

    expect(res.error?.name).toBe('UserError');
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });
});
