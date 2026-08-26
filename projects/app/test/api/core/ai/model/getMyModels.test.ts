import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  getMyModelIds: vi.fn(),
  getModelProvider: vi.fn((provider: string) => ({ order: provider === 'openai' ? 1 : 2 }))
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));

vi.mock('@fastgpt/service/support/permission/model/controller', () => ({
  getMyModelIds: mocks.getMyModelIds
}));

vi.mock('@fastgpt/service/core/app/provider/controller', () => ({
  getModelProvider: mocks.getModelProvider
}));

import handler from '@/pages/api/core/ai/model/getMyModels';

const buildEmbeddingModel = ({ modelId, model, provider }: Record<string, string>) => ({
  modelId,
  model,
  name: model,
  provider,
  type: ModelTypeEnum.embedding,
  scope: 'system' as const,
  isActive: true,
  isCustom: false,
  config: { defaultToken: 512, maxToken: 8192, weight: 100 }
});

const models = [
  buildEmbeddingModel({
    modelId: '68ad85a7463006c963799a01',
    model: 'embedding-a',
    provider: 'openai'
  }),
  buildEmbeddingModel({
    modelId: '68ad85a7463006c963799a02',
    model: 'embedding-b',
    provider: 'voyage'
  }),
  buildEmbeddingModel({
    modelId: '68ad85a7463006c963799a03',
    model: 'embedding-forbidden',
    provider: 'openai'
  })
];

describe('GET /api/core/ai/model/getMyModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemModelMap = new Map(
      models.flatMap((model) => [
        [`id:${model.modelId}`, model] as const,
        [`model:${model.model}`, model] as const
      ])
    ) as typeof global.systemModelMap;
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'member-1',
      isRoot: false,
      tmb: { role: 'member' }
    });
    mocks.getMyModelIds.mockResolvedValue(models.slice(0, 2).map((model) => model.modelId));
  });

  it('paginates only models allowed for the current member and returns provider discovery', async () => {
    const result = await handler({
      query: { modelType: ModelTypeEnum.embedding, pageNum: '1', pageSize: '1' }
    } as any);

    expect(result.total).toBe(2);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].modelId).toBe(models[0].modelId);
    expect(result.providers).toEqual(['openai', 'voyage']);
  });

  it('filters by provider without shrinking the provider discovery list', async () => {
    const result = await handler({
      query: { modelType: ModelTypeEnum.embedding, provider: 'voyage', pageSize: '10' }
    } as any);

    expect(result.list.map((model) => model.modelId)).toEqual([models[1].modelId]);
    expect(result.providers).toEqual(['openai', 'voyage']);
  });

  it('filters cached model IDs that are no longer active', async () => {
    global.systemModelMap.set(`id:${models[1].modelId}`, {
      ...models[1],
      isActive: false
    } as any);

    const result = await handler({
      query: { modelType: ModelTypeEnum.embedding, pageSize: '10' }
    } as any);

    expect(result.list.map((model) => model.modelId)).toEqual([models[0].modelId]);
    expect(result.providers).toEqual(['openai']);
  });
});
