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

import updateModelApi from '@/pages/api/core/ai/model/update';

const buildLlmDocument = () => ({
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-llm',
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

const callUpdate = async (body: unknown) => {
  const root = await getRootUser();

  return Call(updateModelApi, {
    auth: root,
    body
  });
};

describe('update model api', () => {
  it('validates the complete model document and removes runtime fields', async () => {
    const res = await callUpdate({
      modelData: {
        ...buildLlmDocument(),
        model: ' test-llm ',
        avatar: '/model.svg',
        isCustom: true,
        datasetProcess: true
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    expect(res.data).toBeUndefined();
    const saved = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(saved).toMatchObject({
      model: 'test-llm',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      name: 'Test LLM',
      config: {
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000
      }
    });
    expect(saved).not.toHaveProperty('metadata');
    expect(saved).not.toHaveProperty('avatar');
    expect(saved).not.toHaveProperty('isCustom');
    expect(saved).not.toHaveProperty('datasetProcess');
  });

  it('updates an existing model by modelId with a complete model document', async () => {
    const existing = await MongoSystemModel.create(buildLlmDocument());

    const res = await callUpdate({
      modelId: String(existing._id),
      modelData: {
        ...buildLlmDocument(),
        config: {
          ...buildLlmDocument().config,
          maxTemperature: 1.2
        }
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    await expect(MongoSystemModel.findOne({ model: 'test-llm' }).lean()).resolves.toMatchObject({
      config: {
        maxContext: 16000,
        maxTemperature: 1.2
      }
    });
  });

  it('rejects numeric strings without modifying the database', async () => {
    const res = await callUpdate({
      modelData: {
        ...buildLlmDocument(),
        config: {
          ...buildLlmDocument().config,
          maxTemperature: '1.2'
        }
      }
    });

    expect(res.error?.name).toBe('ApiRequestInputParseError');
    expect(res.error?.context).toEqual({ inputSource: 'body' });
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects malformed request bodies through parseApiInput', async () => {
    const res = await callUpdate({ model: 'test-llm', metadata: buildLlmDocument() });

    expect(res.code).toBe(500);
    expect(res.error?.name).toBe('ApiRequestInputParseError');
  });
});
