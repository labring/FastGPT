import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  getMemberModelCatalogPermission: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/model/controller', () => ({
  getMemberModelCatalogPermission: mocks.getMemberModelCatalogPermission
}));

import handler from '@/pages/api/core/ai/model/catalog';

const model = {
  modelId: 'model-1',
  model: 'provider-model',
  name: 'Model',
  provider: 'provider',
  type: ModelTypeEnum.llm,
  scope: 'system' as const,
  isActive: true,
  isCustom: false,
  requestAuth: 'secret',
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
};

describe('GET /api/core/ai/model/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team',
      tmbId: 'member',
      isRoot: false,
      tmb: { role: 'member' }
    });
    mocks.getMemberModelCatalogPermission.mockResolvedValue({
      modelIds: [model.modelId],
      version: 'permission-version'
    });
    global.systemModelCatalogVersion = 'catalog-version';
    global.systemModelMap = new Map([
      [`id:${model.modelId}`, model]
    ]) as typeof global.systemModelMap;
    global.systemConfiguredDefaultModelIds = { llm: model.modelId };
    global.ModelProviderRawCache = [
      {
        provider: 'provider',
        value: { en: 'Provider', 'zh-CN': 'Provider', 'zh-Hant': 'Provider' },
        avatar: 'avatar'
      }
    ];
  });

  it('returns the full desensitized catalog when the version changed', async () => {
    const result = await handler({ query: {} } as any);

    expect(result.version).toBe('1:catalog-version:permission-version');
    expect(result.data?.models[0]).not.toHaveProperty('requestAuth');
    expect(result.data?.defaultModelIds.llm).toBe(model.modelId);
    expect(result.data?.providers[0].provider).toBe('provider');
  });

  it('returns only the version when the client cache is current', async () => {
    const result = await handler({
      query: { version: '1:catalog-version:permission-version' }
    } as any);

    expect(result).toEqual({ version: '1:catalog-version:permission-version' });
  });
});
