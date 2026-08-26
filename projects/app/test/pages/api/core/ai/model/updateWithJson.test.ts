import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    getPluginSystemModelDocuments: vi.fn().mockResolvedValue([]),
    updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
  };
});

import updateWithJsonApi from '@/pages/api/core/ai/model/updateWithJson';

const buildLlmConfig = (model = 'test-llm') => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: 'Test LLM',
  isSystem: true as const,
  config: {
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000,
    toolChoice: true
  },
  isActive: true
});

const buildEmbeddingConfig = (model = 'test-embedding') => ({
  model,
  type: ModelTypeEnum.embedding,
  provider: 'OpenAI',
  name: 'Test Embedding',
  isSystem: true as const,
  config: {
    defaultToken: 500,
    maxToken: 3000
  },
  isActive: true
});

const buildStoredLlm = (model: string) => ({
  model,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: model,
  isSystem: true,
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

  return Call(updateWithJsonApi, {
    auth: root,
    body: { config }
  });
};

describe('updateWithJson api', () => {
  it('strictly imports valid models while preserving stable ids and disabling omitted records', async () => {
    const oldModel = await MongoSystemModel.create(buildStoredLlm('old-model'));
    const existingModel = await MongoSystemModel.create(buildStoredLlm('test-llm'));

    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig(' test-llm '), buildEmbeddingConfig()])
    );

    expect(res.code).toBe(200);
    expect(res.data).toBeUndefined();
    const disabledModel = await MongoSystemModel.findOne({ model: 'old-model' }).lean();
    expect(String(disabledModel?._id)).toBe(String(oldModel._id));
    expect(disabledModel?.isActive).toBe(false);
    const updatedModel = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(String(updatedModel?._id)).toBe(String(existingModel._id));
    expect(updatedModel).toMatchObject({
      model: 'test-llm',
      isSystem: true,
      config: {
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000
      }
    });
    const savedLlm = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(savedLlm?.config).not.toHaveProperty('functionCall');
    await expect(
      MongoSystemModel.findOne({ model: 'test-embedding' }).lean()
    ).resolves.toMatchObject({
      config: {
        weight: 0
      }
    });
  });

  it('repairs numeric strings and preserves existing records', async () => {
    await MongoSystemModel.create(buildStoredLlm('existing-model'));
    const invalidConfig = buildLlmConfig();
    invalidConfig.config.maxContext = '16000' as unknown as number;

    const res = await callUpdateWithJson(JSON.stringify([invalidConfig]));

    expect(res.code).toBe(200);
    await expect(
      MongoSystemModel.findOne({ model: 'existing-model' }).lean()
    ).resolves.toMatchObject({
      isActive: false
    });
    await expect(MongoSystemModel.findOne({ model: 'test-llm' }).lean()).resolves.toMatchObject({
      config: { maxContext: 16000 }
    });
  });

  it('rejects malformed JSON as an input parse error', async () => {
    const res = await callUpdateWithJson('{invalid-json');

    expect(res.code).toBe(500);
    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it('removes invalid optional nested model configuration', async () => {
    const config = buildLlmConfig();
    config.config.defaultConfig = '' as unknown as Record<string, unknown>;

    const res = await callUpdateWithJson(JSON.stringify([config]));

    expect(res.code).toBe(200);
    const saved = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(saved?.config).not.toHaveProperty('defaultConfig');
  });

  it('rejects the whole batch when one model is irreparable and preserves existing records', async () => {
    await MongoSystemModel.create(buildStoredLlm('existing-model'));

    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig(), { model: '', provider: null, type: 'unknown' }])
    );

    expect(res.error?.name).toBe('UserError');
    await expect(MongoSystemModel.findOne({ model: 'existing-model' })).resolves.not.toBeNull();
    await expect(MongoSystemModel.findOne({ model: 'test-llm' })).resolves.toBeNull();
  });
});
