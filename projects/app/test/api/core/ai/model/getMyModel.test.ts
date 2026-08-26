import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  getMyModelIds: vi.fn()
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

import handler from '@/pages/api/core/ai/model/getMyModel';

const model = {
  modelId: '68ad85a7463006c963799a05',
  model: 'text-embedding-3-small',
  name: 'Text embedding 3 small',
  provider: 'openai',
  type: ModelTypeEnum.embedding,
  scope: 'system' as const,
  isActive: true,
  isCustom: false,
  config: {
    defaultToken: 512,
    maxToken: 8192,
    weight: 100
  }
};

describe('GET /api/core/ai/model/getMyModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemModelMap = new Map([
      [`id:${model.modelId}`, model],
      [`model:${model.model}`, model]
    ]) as typeof global.systemModelMap;
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'member-1',
      isRoot: false,
      tmb: { role: 'member' }
    });
    mocks.getMyModelIds.mockResolvedValue([model.modelId]);
  });

  it('returns an allowed model by modelId', async () => {
    const result = await handler({ query: { modelId: model.modelId } } as any);

    expect(result).toMatchObject({ modelId: model.modelId, model: model.model });
  });

  it('rejects legacy model references at this internal API boundary', async () => {
    await expect(handler({ query: { model: model.model } } as any)).rejects.toBeInstanceOf(
      ApiRequestInputParseError
    );
  });

  it('does not expose a model outside the member permission set', async () => {
    mocks.getMyModelIds.mockResolvedValue([]);

    await expect(handler({ query: { modelId: model.modelId } } as any)).rejects.toMatchObject({
      message: 'modelUnExist'
    });
  });
});
