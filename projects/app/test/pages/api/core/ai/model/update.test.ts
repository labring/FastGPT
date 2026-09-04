import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { Call } from '@test/utils/request';
import { getRootUser } from '@test/datas/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMocks = vi.hoisted(() => ({
  refreshModelTemplates: vi.fn(),
  updatedReloadSystemModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/config/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config/utils')>();

  return {
    ...actual,
    refreshModelTemplates: configMocks.refreshModelTemplates,
    updatedReloadSystemModel: configMocks.updatedReloadSystemModel
  };
});

import createModelApi from '@/pages/api/admin/settings/model/create';
import updateModelApi from '@/pages/api/admin/settings/model/update';

const buildLlmDocument = () => ({
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-llm',
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

const callApi = async ({ handler, body }: { handler: any; body: unknown }) => {
  const root = await getRootUser();
  return Call(handler, { auth: root, body });
};

describe('admin settings model create/update api', () => {
  beforeEach(() => {
    configMocks.refreshModelTemplates.mockReset().mockResolvedValue([]);
    configMocks.updatedReloadSystemModel.mockReset().mockResolvedValue(undefined);
  });

  it('creates a custom model through the dedicated create endpoint', async () => {
    const res = await callApi({
      handler: createModelApi,
      body: { modelData: buildLlmDocument() }
    });

    expect(res.error).toBeUndefined();
    expect(res.data?.modelId).toBeTruthy();
    await expect(MongoAIModel.findById(res.data?.modelId).lean()).resolves.toMatchObject({
      model: 'test-llm',
      scope: 'system',
      config: { maxContext: 16000 }
    });
  });

  it('rejects creating a model whose type conflicts with a same-name plugin template', async () => {
    configMocks.refreshModelTemplates.mockResolvedValueOnce([buildLlmDocument()]);

    const res = await callApi({
      handler: createModelApi,
      body: {
        modelData: {
          type: ModelTypeEnum.embedding,
          provider: 'OpenAI',
          model: buildLlmDocument().model,
          name: 'Conflicting embedding',
          scope: 'system',
          isActive: true,
          config: { defaultToken: 512, maxToken: 8192, weight: 100 }
        }
      }
    });

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('updates an existing model only by modelId', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          ...buildLlmDocument(),
          config: { ...buildLlmDocument().config, maxTemperature: 1.2 }
        }
      }
    });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      config: { maxContext: 16000, maxTemperature: 1.2 }
    });
  });

  it('accepts and persists a null max temperature', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          ...buildLlmDocument(),
          config: { ...buildLlmDocument().config, maxTemperature: null }
        }
      }
    });

    expect(res.error).toBeUndefined();
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      config: { maxTemperature: null }
    });
  });

  it('rejects non-canonical values instead of repairing them', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    const res = await callApi({
      handler: updateModelApi,
      body: {
        modelId: String(existing._id),
        modelData: {
          ...buildLlmDocument(),
          config: { ...buildLlmDocument().config, maxTemperature: '1.2' }
        }
      }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    const unchanged = await MongoAIModel.findById(existing._id).lean();
    expect(unchanged?.config).toMatchObject({ maxContext: 16000, maxResponse: 8000 });
    expect(unchanged?.config).not.toHaveProperty('maxTemperature');
  });

  it('rejects update requests without modelId', async () => {
    const res = await callApi({
      handler: updateModelApi,
      body: { modelData: buildLlmDocument() }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects a non-ObjectId modelId at the API boundary', async () => {
    const res = await callApi({
      handler: updateModelApi,
      body: { modelId: 'not-an-object-id', modelData: buildLlmDocument() }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects a type that conflicts with a same-name plugin template before writing', async () => {
    const existing = await MongoAIModel.create(buildLlmDocument());
    configMocks.refreshModelTemplates.mockResolvedValueOnce([buildLlmDocument()]);
    const embeddingDocument = {
      type: ModelTypeEnum.embedding,
      provider: 'OpenAI',
      model: buildLlmDocument().model,
      name: 'Conflicting embedding',
      scope: 'system' as const,
      isActive: true,
      config: { defaultToken: 512, maxToken: 8192, weight: 100 }
    };

    const res = await callApi({
      handler: updateModelApi,
      body: { modelId: String(existing._id), modelData: embeddingDocument }
    });

    expect(res.error?.name).toBe('UserError');
    await expect(MongoAIModel.findById(existing._id).lean()).resolves.toMatchObject({
      type: ModelTypeEnum.llm,
      config: { maxContext: 16000 }
    });
    expect(configMocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
