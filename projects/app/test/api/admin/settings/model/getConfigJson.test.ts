import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { describe, expect, it } from 'vitest';
import getConfigJsonApi from '@/pages/api/admin/settings/model/getConfigJson';

describe('GET /api/admin/settings/model/getConfigJson', () => {
  it('exports an empty JSON array when no system model is installed', async () => {
    const root = await getRootUser();

    const response = await Call<string>(getConfigJsonApi, { auth: root });

    expect(response.code).toBe(200);
    expect(JSON.parse(response.data)).toEqual([]);
  });

  it('exports canonical model data with its stable modelId', async () => {
    const root = await getRootUser();
    const model = await MongoAIModel.create({
      model: 'exported-model',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      name: 'Exported model',
      scope: 'system',
      isActive: true,
      requestUrl: 'https://example.com/v1',
      requestAuth: 'secret-token',
      inputPrice: 1,
      outputPrice: 2,
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
    expect(JSON.parse(response.data)).toEqual([
      expect.objectContaining({
        modelId: String(model._id),
        model: 'exported-model',
        type: ModelTypeEnum.llm,
        provider: 'OpenAI',
        requestUrl: 'https://example.com/v1',
        requestAuth: 'secret-token',
        config: expect.objectContaining({ maxContext: 16000, toolChoice: true })
      })
    ]);
    expect(JSON.parse(response.data)[0]).not.toHaveProperty('_id');
    expect(JSON.parse(response.data)[0]).not.toHaveProperty('metadata');
    expect(JSON.parse(response.data)[0]).not.toHaveProperty('unknownTopLevel');
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
