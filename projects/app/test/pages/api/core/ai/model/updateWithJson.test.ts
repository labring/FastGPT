import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
  };
});

import updateWithJsonApi from '@/pages/api/core/ai/model/updateWithJson';

const buildLlmConfig = (model = 'test-llm') => ({
  model,
  metadata: {
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'dirty-model',
    name: 'Test LLM',
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000,
    toolChoice: true,
    isActive: true
  }
});

const buildEmbeddingConfig = (model = 'test-embedding') => ({
  model,
  metadata: {
    type: ModelTypeEnum.embedding,
    provider: 'OpenAI',
    model,
    name: 'Test Embedding',
    defaultToken: 500,
    maxToken: 3000,
    isActive: true
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
  it('strictly imports valid models, fills defaults and clears old records', async () => {
    await MongoSystemModel.create({
      model: 'old-model',
      metadata: buildLlmConfig('old-model').metadata
    });

    const res = await callUpdateWithJson(
      JSON.stringify([buildLlmConfig(' test-llm '), buildEmbeddingConfig()])
    );

    expect(res.code).toBe(200);
    expect(res.data).toBeUndefined();
    await expect(MongoSystemModel.findOne({ model: 'old-model' })).resolves.toBeNull();
    await expect(MongoSystemModel.findOne({ model: 'test-llm' }).lean()).resolves.toMatchObject({
      metadata: {
        model: 'test-llm'
      }
    });
    const savedLlm = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(savedLlm?.metadata).not.toHaveProperty('functionCall');
    await expect(
      MongoSystemModel.findOne({ model: 'test-embedding' }).lean()
    ).resolves.toMatchObject({
      metadata: {
        weight: 0
      }
    });
  });

  it('rejects numeric strings and preserves existing records', async () => {
    await MongoSystemModel.create({
      model: 'existing-model',
      metadata: buildLlmConfig('existing-model').metadata
    });
    const invalidConfig = buildLlmConfig();
    invalidConfig.metadata.maxContext = '16000' as unknown as number;

    const res = await callUpdateWithJson(JSON.stringify([invalidConfig]));

    expect(res.code).toBe(500);
    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoSystemModel.findOne({ model: 'existing-model' })).resolves.not.toBeNull();
    await expect(MongoSystemModel.findOne({ model: 'test-llm' })).resolves.toBeNull();
  });

  it('rejects malformed JSON as an input parse error', async () => {
    const res = await callUpdateWithJson('{invalid-json');

    expect(res.code).toBe(500);
    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects invalid nested model configuration', async () => {
    const config = buildLlmConfig();
    config.metadata.defaultConfig = '' as unknown as Record<string, unknown>;

    const res = await callUpdateWithJson(JSON.stringify([config]));

    expect(res.code).toBe(500);
    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });
});
