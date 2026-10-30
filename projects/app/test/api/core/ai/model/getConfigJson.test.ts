import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { describe, expect, it } from 'vitest';
import getConfigJsonApi from '@/pages/api/core/ai/model/getConfigJson';

describe('GET /api/core/ai/model/getConfigJson', () => {
  it('exports an empty JSON array when no system model is installed', async () => {
    const root = await getRootUser();

    const response = await Call<string>(getConfigJsonApi, { auth: root });

    expect(response.code).toBe(200);
    expect(JSON.parse(response.data)).toEqual([]);
  });

  it('exports canonical model data with its stable modelId', async () => {
    const root = await getRootUser();
    const { insertedId: modelId } = await MongoAIModel.collection.insertOne({
      model: 'exported-model',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      name: 'Exported model',
      scope: 'system',
      sortOrder: 123,
      isActive: true,
      requestUrl: 'https://example.com/v1',
      requestAuth: 'secret-token',
      inputPrice: 1,
      outputPrice: 2,
      pricing: { tiers: [{ inputPrice: 1000, outputPrice: 2000 }] },
      config: {
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000,
        toolChoice: true
      },
      metadata: { legacyOnly: true },
      unknownTopLevel: 'strip-me'
    });

    const response = await Call<string>(getConfigJsonApi, { auth: root });

    expect(response.code).toBe(200);
    const exported = JSON.parse(response.data);
    expect(exported).toEqual([
      expect.objectContaining({
        modelId: String(modelId),
        model: 'exported-model',
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        requestUrl: 'https://example.com/v1',
        requestAuth: 'secret-token',
        config: expect.objectContaining({ maxContext: 16000, toolChoice: true })
      })
    ]);
    expect(exported[0]).not.toHaveProperty('_id');
    expect(exported[0]).not.toHaveProperty('metadata');
    expect(exported[0]).not.toHaveProperty('unknownTopLevel');
    expect(exported[0]).not.toHaveProperty('sortOrder');
    expect(exported[0]).toMatchObject({
      pricing: { tiers: [{ inputPrice: 1000, outputPrice: 2000 }] }
    });
    expect(exported[0]).not.toHaveProperty('inputPrice');
    expect(exported[0]).not.toHaveProperty('outputPrice');
    // 导出保留数据库中的旧价格，不触发格式转换或回写。
    expect(await MongoAIModel.findById(modelId).lean()).toMatchObject({
      inputPrice: 1,
      outputPrice: 2,
      sortOrder: 123
    });
  });

  it('rejects unauthenticated configuration exports', async () => {
    await MongoAIModel.create({
      model: 'private-model',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      name: 'Private model',
      scope: 'system',
      isActive: true,
      requestAuth: 'must-not-leak',
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
    });

    const response = await Call<string>(getConfigJsonApi);

    expect(response.code).not.toBe(200);
    expect(response.data).toBeUndefined();
    expect(JSON.stringify(response.error)).not.toContain('must-not-leak');
  });
});
