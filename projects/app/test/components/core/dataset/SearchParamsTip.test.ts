import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loading: false, error: false }));
vi.mock('@/web/core/ai/model/useModelSummary', () => ({
  useModelSummary: ({ modelId }: { modelId?: string }) => ({
    loading: mocks.loading,
    error: mocks.error,
    detail: !modelId
      ? undefined
      : modelId === 'active'
        ? { modelId, status: 'active', name: 'Active model' }
        : modelId === 'inactive'
          ? { modelId, status: 'disabled', name: 'Old model' }
          : modelId === 'forbidden'
            ? { modelId, status: 'forbidden', name: 'Restricted model' }
            : { modelId, status: 'deleted' }
  })
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { model: string }) =>
      key === 'common:model_disabled'
        ? `${values?.model}已停用`
        : key === 'common:model_delisted'
          ? '该模型已下架'
          : key === 'common:model_forbidden'
            ? `无权使用 ${values?.model}`
            : key
  })
}));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ children, color }: { children: React.ReactNode; color?: string }) =>
    React.createElement('div', { 'data-color': color }, children);
  return {
    Flex: Element,
    Box: Element,
    Spinner: () => React.createElement('span', { 'data-spinner': true }),
    Table: Element,
    Thead: Element,
    Tbody: Element,
    Tr: Element,
    Th: Element,
    Td: Element,
    TableContainer: Element
  };
});
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));

describe('SearchParamsTip', () => {
  beforeEach(() => {
    mocks.loading = false;
    mocks.error = false;
  });
  const render = (queryExtensionModel?: string, usingExtensionQuery = true) =>
    renderToStaticMarkup(
      React.createElement(SearchParamsTip, {
        searchMode: DatasetSearchModeEnum.embedding,
        usingExtensionQuery,
        queryExtensionModel
      })
    );
  it('shows the selected model without a default or legacy-name fallback', () => {
    expect(render('active')).toContain('Active model');
    expect(render()).toContain('common:not_model_config');
    expect(render()).not.toContain('Active model');
    expect(render('legacy-active')).toContain('该模型已下架');
  });
  it('shows disabled and delisted models in red', () => {
    expect(render('inactive')).toContain('data-color="red.500"');
    expect(render('inactive')).toContain('Old model已停用');
    expect(render('deleted')).toContain('data-color="red.500">该模型已下架');
    expect(render('forbidden')).toContain('data-color="red.500"');
    expect(render('forbidden')).toContain('无权使用 Restricted model');
  });
  it('does not confuse loading or a disabled feature with delisted state', () => {
    mocks.loading = true;
    expect(render('active')).toContain('common:model_loading_label');
    expect(render('active')).not.toContain('data-spinner');
    expect(render('active')).not.toContain('该模型已下架');
    expect(render('active', false)).toContain('❌');
  });
  it('shows request failure without claiming the model was deleted', () => {
    mocks.error = true;
    expect(render('active')).toContain('common:model_detail_load_failed');
    expect(render('active')).not.toContain('该模型已下架');
  });
});
