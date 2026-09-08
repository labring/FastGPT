import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  selectAiModel: vi.fn(),
  llmModels: [] as { modelId: string; model: string; name: string }[],
  defaultModelId: undefined as string | undefined,
  complete: undefined as (() => void) | undefined
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: () => ({ defaultModels: { llm: { modelId: mocks.defaultModelId } } })
}));
vi.mock('@/web/core/ai/model/useUserModelLists', () => ({
  useUserModelLists: () => ({
    llmModelList: mocks.llmModels,
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
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => {
      if (children === 'common:Done') mocks.complete = onClick;
      return null;
    },
    ModalBody: ({ children }: { children: React.ReactNode }) => children,
    ModalFooter: ({ children }: { children: React.ReactNode }) => children
  };
});

import DatasetParamsModal from '@/components/core/app/DatasetParamsModal';

describe('DatasetParamsModal', () => {
  beforeEach(() => {
    mocks.selectAiModel.mockClear();
    mocks.llmModels = [];
    mocks.defaultModelId = undefined;
    mocks.complete = undefined;
  });

  it.each([undefined, 'second'])(
    'submits an actual default selection when enabled (default=%s)',
    async (defaultModelId) => {
      mocks.llmModels = [
        { modelId: 'first', model: 'first-model', name: 'First' },
        { modelId: 'second', model: 'second-model', name: 'Second' }
      ];
      mocks.defaultModelId = defaultModelId;
      const onSuccess = vi.fn();
      renderToStaticMarkup(
        React.createElement(DatasetParamsModal, {
          searchMode: DatasetSearchModeEnum.embedding,
          datasetSearchUsingExtensionQuery: true,
          datasetSearchExtensionModelId: '',
          onClose: vi.fn(),
          onSuccess
        })
      );
      mocks.complete?.();
      await vi.waitFor(() =>
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            datasetSearchUsingExtensionQuery: true,
            datasetSearchExtensionModelId: defaultModelId ?? 'first'
          })
        )
      );
    }
  );

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
