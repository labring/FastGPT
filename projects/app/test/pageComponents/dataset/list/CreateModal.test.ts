import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  defaultVlmId: undefined as string | undefined
}));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: () => ({ defaultModels: { datasetImageLLM: { modelId: mocks.defaultVlmId } } })
}));
vi.mock('@/web/core/ai/model/useUserModelLists', () => ({
  useUserModelLists: () => ({
    embeddingModelList: [
      { modelId: 'embedding', model: 'embedding', name: 'Embedding', config: {} }
    ],
    llmModelList: [{ modelId: 'llm', model: 'llm', name: 'LLM' }],
    vlmModelList: []
  })
}));
vi.mock('@/web/common/system/utils', () => ({
  getWebDefaultEmbeddingModel: (list: unknown[]) => list[0],
  getWebDefaultLLMModel: (list: unknown[]) => list[0]
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: false })
}));
vi.mock('@fastgpt/web/common/file/hooks/useUploadAvatar', () => ({
  useUploadAvatar: () => ({ Component: () => null, handleFileSelectorOpen: vi.fn() })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children, required }: { children: React.ReactNode; required?: boolean }) =>
    React.createElement('label', { 'data-required': required }, children)
}));
vi.mock('@/components/Select/AIModelSelector', () => ({
  default: (props: unknown) => {
    mocks.select(props);
    return null;
  }
}));
vi.mock('@/pageComponents/dataset/ApiDatasetForm', () => ({ default: () => null }));
vi.mock('@/components/common/ComplianceTip/index', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
import CreateModal from '@/pageComponents/dataset/list/CreateModal';

describe('dataset CreateModal model settings', () => {
  beforeEach(() => {
    mocks.select.mockClear();
    mocks.defaultVlmId = undefined;
  });
  it('marks the two required models and offers an explicit unset VLM selection', () => {
    const html = renderToStaticMarkup(
      React.createElement(CreateModal, { type: DatasetTypeEnum.dataset, onClose: vi.fn() })
    );
    expect(html).toContain('data-required="true">common:core.ai.model.Vector Model');
    expect(html).toContain('data-required="true">common:core.ai.model.Dataset Agent Model');
    const selectors = mocks.select.mock.calls.map(([props]) => props);
    expect(selectors[0].canBeUnset).toBeUndefined();
    expect(selectors[1].canBeUnset).toBeUndefined();
    expect(selectors[2]).toMatchObject({
      canBeUnset: true,
      unsetLabel: 'common:not_set',
      value: ''
    });
  });
  it('retains the configured default VLM while allowing users to opt out', () => {
    mocks.defaultVlmId = 'default-vision';
    renderToStaticMarkup(
      React.createElement(CreateModal, { type: DatasetTypeEnum.dataset, onClose: vi.fn() })
    );
    expect(mocks.select.mock.calls[2][0]).toMatchObject({
      value: 'default-vision',
      canBeUnset: true
    });
  });
});
