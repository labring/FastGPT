import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  useModelQuery: vi.fn(),
  useRequest: vi.fn(),
  getUserModelCatalog: vi.fn(),
  getPublicModelCatalog: vi.fn()
}));
vi.mock('@/web/core/ai/model/catalogApi', () => ({
  getUserModelCatalog: mocks.getUserModelCatalog,
  getPublicModelCatalog: mocks.getPublicModelCatalog
}));
vi.mock('@/web/core/ai/model/useModelQuery', () => ({ useModelQuery: mocks.useModelQuery }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({ useRequest: mocks.useRequest }));
vi.mock('@/web/support/user/useUserStore', () => ({ useUserStore: () => ({}) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@fastgpt/web/hooks/useVirtualList', () => ({
  useStaticVirtualList: ({ data }: { data: unknown[] }) => ({
    virtualDataList: data.map((data, index) => ({ data, index })),
    topPlaceholderHeight: 0,
    bottomPlaceholderHeight: 0
  })
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: ({ renderBody }: { renderBody: () => React.ReactNode }) => renderBody()
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/String/CopyBox', () => ({
  default: ({ value }: { value: string }) => React.createElement('span', null, value)
}));
vi.mock('@/components/core/ai/ModelListFilters', () => ({ default: () => null }));
vi.mock('@/components/core/ai/ModelScopeCell', () => ({ default: () => null }));
vi.mock('@/components/core/ai/ModelCapabilityTags', () => ({ default: () => null }));
vi.mock('@/components/core/ai/PriceTiersLabel', () => ({ default: () => null }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import ModelTable from '@/components/core/ai/ModelTable';

const providers = ['a', 'b'].map((provider) => ({
  provider,
  value: { en: provider, 'zh-CN': provider, 'zh-Hant': provider },
  avatar: ''
}));
const models = [
  { name: 'team-b', scope: ModelScopeEnum.team, provider: 'b', tmbId: 'member' },
  { name: 'team-a', scope: ModelScopeEnum.team, provider: 'a', tmbId: 'member' },
  { name: 'shared-b', scope: ModelScopeEnum.team, provider: 'b', tmbId: 'other-member' },
  { name: 'shared-a', scope: ModelScopeEnum.team, provider: 'a', tmbId: 'other-member' },
  { name: 'system-b', scope: ModelScopeEnum.system, provider: 'b' },
  { name: 'system-a', scope: ModelScopeEnum.system, provider: 'a' }
].map((model) => ({
  ...model,
  modelId: model.name,
  model: model.name,
  type: ModelTypeEnum.llm,
  config: {},
  isActive: true
}));

/** 渲染真实表体，虚拟窗口展开全部 fixture，直接验证用户看到的行顺序。 */
const renderNames = (permissionConfig: boolean) => {
  const dom = new JSDOM(
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(ModelTable, { permissionConfig })
      )
    )
  );
  const names = Array.from(
    dom.window.document.querySelectorAll('tbody tr'),
    (row) => row.querySelector('td span')?.textContent
  );
  dom.window.close();
  return names;
};

describe('ModelTable display ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const catalog = { models, providers, defaultModelIds: {} };
    mocks.useModelQuery.mockReturnValue({ data: catalog });
    mocks.useRequest.mockReturnValue({
      data: { ...catalog, models: models.filter((model) => model.scope === ModelScopeEnum.system) }
    });
    mocks.getUserModelCatalog.mockResolvedValue({ version: 'custom-version', data: catalog });
  });

  it('requests the custom display catalog and renders its order across providers', async () => {
    expect(renderNames(true)).toEqual([
      'team-b',
      'team-a',
      'shared-b',
      'shared-a',
      'system-b',
      'system-a'
    ]);
    const query = mocks.useModelQuery.mock.calls[0][0];
    expect(query).toEqual(expect.objectContaining({ enabled: true, observeCatalog: false }));
    await query.read();
    expect(mocks.getUserModelCatalog).toHaveBeenCalledWith({ orderBy: 'custom' });
    expect(mocks.useRequest).toHaveBeenCalledWith(mocks.getPublicModelCatalog, { manual: true });
  });

  it('retains provider ordering for the public price table', () => {
    expect(renderNames(false)).toEqual(['system-a', 'system-b']);
    expect(mocks.useModelQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(mocks.useRequest).toHaveBeenCalledWith(mocks.getPublicModelCatalog, { manual: false });
  });
});
