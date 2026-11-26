import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { describe, expect, it } from 'vitest';
import getConfigJsonApi from '@/pages/api/core/ai/model/getConfigJson';

describe('GET /api/core/ai/model/getConfigJson', () => {
  it.each([
    { pricing: null, expected: undefined },
    { pricing: {}, expected: { type: 'duration' } },
    { pricing: { unitPrice: 0 }, expected: { type: 'duration', unitPrice: 0 } },
    { pricing: { unitPrice: 0.4 }, expected: { type: 'duration', unitPrice: 0.4 } },
    {
      pricing: { type: 'tokens', inputPrice: 10, outputPrice: 20 },
      expected: { type: 'tokens', inputPrice: 10, outputPrice: 20 }
    }
  ])(
    'exports STT pricing $pricing without changing database records',
    async ({ pricing, expected }) => {
      const root = await getRootUser();
      const raw = {
        model: 'old-node-stt',
        type: ModelTypeEnum.stt,
        provider: 'Private provider',
        name: 'Old node STT',
        scope: 'system',
        requestUrl: 'https://example.com/v1',
        requestAuth: 'fixture-auth',
        pricing,
        config: {}
      };
      const { insertedId } = await MongoAIModel.collection.insertOne({ ...raw });
      const before = await MongoAIModel.collection.findOne({ _id: insertedId });
      const response = await Call<string>(getConfigJsonApi, { auth: root });
      expect(response.code).toBe(200);
      const { pricing: _pricing, ...fields } = raw;
      expect(JSON.parse(response.data)).toEqual([
        {
          ...fields,
          ...(expected !== undefined && { pricing: expected }),
          modelId: String(insertedId)
        }
      ]);
      expect(await MongoAIModel.collection.findOne({ _id: insertedId })).toEqual(before);
    }
  );

  it('exports unknown STT price types as free without changing stored data', async () => {
    const root = await getRootUser();
    const { insertedId } = await MongoAIModel.collection.insertOne({
      model: 'invalid-stt',
      type: ModelTypeEnum.stt,
      provider: 'OpenAI',
      name: 'Invalid STT',
      scope: 'system',
      config: {},
      pricing: { type: 'unknown', unitPrice: 0.4 }
    });
    const before = await MongoAIModel.collection.findOne({ _id: insertedId });
    const response = await Call<string>(getConfigJsonApi, { auth: root });
    expect(response.code).toBe(200);
    expect(JSON.parse(response.data)[0]).not.toHaveProperty('pricing');
    expect(await MongoAIModel.collection.findOne({ _id: insertedId })).toEqual(before);
  });

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
    // 导出不触发历史金额换算或数据库回写。
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
