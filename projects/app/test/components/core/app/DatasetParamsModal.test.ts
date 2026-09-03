import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  selectAiModel: vi.fn()
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: () => ({ defaultModels: {} })
}));
vi.mock('@/web/core/ai/model/useUserModelLists', () => ({
  useUserModelLists: () => ({
    llmModelList: [],
    reRankModelList: [{ modelId: 'rerank-id', model: 'rerank-model', name: 'Rerank model' }]
  })
}));
vi.mock('@/components/Select/AIModelSelector', () => ({
  default: (props: unknown) => {
    mocks.selectAiModel(props);
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  return {
    ...actual,
    ModalBody: ({ children }: { children: React.ReactNode }) => children,
    ModalFooter: ({ children }: { children: React.ReactNode }) => children
  };
});

import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';

describe('DatasetParamsModal', () => {
  beforeEach(() => {
    mocks.selectAiModel.mockClear();
  });

  it('uses the rerank model type for the rerank selector', () => {
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: true,
        rerankModelId: 'rerank-id',
        rerankWeight: 0.5,
        onClose: vi.fn(),
        onSuccess: vi.fn()
      })
    );

    expect(mocks.selectAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelType: ModelTypeEnum.rerank,
        value: 'rerank-id',
        list: [{ value: 'rerank-id', label: 'Rerank model' }]
      })
    );
  });
});
