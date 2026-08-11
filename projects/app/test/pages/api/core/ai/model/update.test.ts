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

const buildLlmMetadata = () => ({
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-llm',
  name: 'Test LLM',
  maxContext: 16000,
  maxResponse: 8000,
  quoteMaxToken: 12000,
  toolChoice: true,
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
  it('validates the complete merged model, fills defaults and removes runtime fields', async () => {
    const res = await callUpdate({
      model: ' test-llm ',
      metadata: {
        ...buildLlmMetadata(),
        avatar: '/model.svg',
        isCustom: true,
        datasetProcess: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeUndefined();
    const saved = await MongoSystemModel.findOne({ model: 'test-llm' }).lean();
    expect(saved?.metadata).toMatchObject({
      model: 'test-llm'
    });
    expect(saved?.metadata).not.toHaveProperty('functionCall');
    expect(saved?.metadata).not.toHaveProperty('avatar');
    expect(saved?.metadata).not.toHaveProperty('isCustom');
    expect(saved?.metadata).not.toHaveProperty('datasetProcess');
  });

  it('supports strict partial updates by validating after merging persisted metadata', async () => {
    await MongoSystemModel.create({
      model: 'test-llm',
      metadata: {
        ...buildLlmMetadata(),
        functionCall: false
      }
    });

    const res = await callUpdate({
      model: 'test-llm',
      metadata: { maxTemperature: 1.2 }
    });

    expect(res.code).toBe(200);
    await expect(MongoSystemModel.findOne({ model: 'test-llm' }).lean()).resolves.toMatchObject({
      metadata: {
        maxContext: 16000,
        maxTemperature: 1.2
      }
    });
  });

  it('rejects numeric strings without modifying the database', async () => {
    const res = await callUpdate({
      model: 'test-llm',
      metadata: {
        ...buildLlmMetadata(),
        maxTemperature: '1.2'
      }
    });

    expect(res.code).toBe(500);
    await expect(MongoSystemModel.countDocuments()).resolves.toBe(0);
  });

  it('rejects malformed request bodies through parseApiInput', async () => {
    const res = await callUpdate({ metadata: buildLlmMetadata() });

    expect(res.code).toBe(500);
    expect(res.error?.name).toBe('ApiRequestInputParseError');
  });
});
