import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/model/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/utils')>()),
  updatedReloadSystemModel: vi.fn().mockResolvedValue(undefined)
}));

import createModelApi from '@/pages/api/core/ai/model/create';

describe('create model api', () => {
  it('does not persist price fields when root creates a team model', async () => {
    const root = await getRootUser();

    const res = await Call(createModelApi, {
      auth: root,
      body: {
        model: 'team-llm',
        type: ModelTypeEnum.llm,
        name: 'Team model',
        provider: 'OpenAI',
        isSystem: false,
        isActive: true,
        maxContext: 16000,
        maxResponse: 8000,
        quoteMaxToken: 12000,
        charsPointsPrice: 3,
        priceTiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]
      }
    });

    expect(res.code).toBe(200);
    const created = await MongoSystemModel.findById(res.data.id).lean();
    expect(created?.isSystem).toBe(false);
    expect(created?.charsPointsPrice).toBeUndefined();
    expect(created?.priceTiers).toEqual([]);
  });
});
