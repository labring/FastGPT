import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  selectAiModel: vi.fn(),
  llmModels: [] as { modelId: string; model: string; name: string }[],
  defaultModelId: undefined as string | undefined,
  defaultRerankId: undefined as string | undefined,
  rerankToggle: undefined as ((event: { target: { checked: boolean } }) => void) | undefined,
  tab: 'searchMode',
  setTab: vi.fn(),
  toggle: undefined as ((event: { target: { checked: boolean } }) => void) | undefined,
  toast: vi.fn(),
  completeDisabled: undefined as boolean | undefined,
  complete: undefined as (() => void) | undefined
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      initial === 'searchMode' ? [mocks.tab, mocks.setTab] : actual.useState(initial)
  };
});
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>();
  return {
    ...actual,
    useForm: (...args: Parameters<typeof actual.useForm>) => {
      const form = actual.useForm(...args);
      // SSR harness 不执行挂载 effect；模拟已挂载表单，异步 handler 的 getValues 才读取最新字段。
      form.control._stateFlags.mount = true;
      return form;
    }
  };
});

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/core/ai/model/modelData', () => ({
  getModelDefault: vi.fn(async ({ modelType }) => {
    if (modelType === 'rerank') return { modelId: mocks.defaultRerankId ?? 'rerank-id' };
    return (
      mocks.llmModels.find((model) => model.modelId === mocks.defaultModelId) ?? mocks.llmModels[0]
    );
  })
}));
vi.mock('@/components/Select/AIModelSelector', () => ({
  default: (props: unknown) => {
    mocks.selectAiModel(props);
    return null;
  }
}));
vi.mock('@/components/common/Textarea/MyTextarea', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  return {
    ...actual,
    Switch: ({ name, onChange }: { name?: string; onChange?: typeof mocks.toggle }) => {
      if (name === 'datasetSearchUsingExtensionQuery') mocks.toggle = onChange;
      if (name === 'usingReRank') mocks.rerankToggle = onChange;
      return null;
    },
    Button: ({
      children,
      onClick,
      isDisabled
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      isDisabled?: boolean;
    }) => {
      if (children === 'common:Done') {
        mocks.complete = onClick;
        mocks.completeDisabled = isDisabled;
      }
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
    mocks.defaultRerankId = undefined;
    mocks.rerankToggle = undefined;
    mocks.complete = undefined;
    mocks.completeDisabled = undefined;
    mocks.tab = 'searchMode';
    mocks.setTab.mockClear();
    mocks.toast.mockClear();
    mocks.toggle = undefined;
  });

  it.each([undefined, 'second'])(
    'blocks an enabled empty model on confirmation instead of silently filling it (default=%s)',
    async (defaultModelId) => {
      mocks.llmModels = [
        { modelId: 'first', model: 'first-model', name: 'First' },
        { modelId: 'second', model: 'second-model', name: 'Second' }
      ];
      mocks.defaultModelId = defaultModelId;
      const onSuccess = vi.fn();
      const onClose = vi.fn();
      renderToStaticMarkup(
        React.createElement(DatasetParamsModal, {
          searchMode: DatasetSearchModeEnum.embedding,
          datasetSearchUsingExtensionQuery: true,
          datasetSearchExtensionModelId: '',
          onClose,
          onSuccess
        })
      );
      expect(mocks.completeDisabled).not.toBe(true);
      mocks.complete?.();
      await vi.waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith({
          status: 'warning',
          title: 'common:core.workflow.check.model_required_short'
        })
      );
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(mocks.setTab).toHaveBeenCalledWith('queryExtension');
    }
  );

  it('writes the default model when the user enables query extension and submits that ID', async () => {
    mocks.tab = 'queryExtension';
    mocks.defaultModelId = 'default-query-model';
    mocks.llmModels = [
      { modelId: 'first-query-model', model: 'first', name: 'First' },
      { modelId: 'default-query-model', model: 'default', name: 'Default' }
    ];
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        datasetSearchUsingExtensionQuery: false,
        onClose,
        onSuccess
      })
    );
    expect(mocks.toggle).toBeDefined();
    await mocks.toggle?.({ target: { checked: true } });
    mocks.complete?.();
    await vi.waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetSearchUsingExtensionQuery: true,
          datasetSearchExtensionModelId: 'default-query-model'
        })
      )
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('preserves an existing nonempty model instead of replacing it with the default', async () => {
    mocks.tab = 'queryExtension';
    mocks.defaultModelId = 'default-query-model';
    const onSuccess = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        datasetSearchUsingExtensionQuery: true,
        datasetSearchExtensionModelId: 'selected-query-model',
        onClose: vi.fn(),
        onSuccess
      })
    );
    await mocks.toggle?.({ target: { checked: true } });
    mocks.complete?.();
    await vi.waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetSearchExtensionModelId: 'selected-query-model'
        })
      )
    );
  });

  it.each([undefined, 'unavailable-default'])(
    'uses the first candidate when enabling without an available default (%s)',
    async (defaultModelId) => {
      mocks.tab = 'queryExtension';
      mocks.defaultModelId = defaultModelId;
      mocks.llmModels = [{ modelId: 'first-query-model', model: 'first', name: 'First' }];
      const onSuccess = vi.fn();
      renderToStaticMarkup(
        React.createElement(DatasetParamsModal, {
          searchMode: DatasetSearchModeEnum.embedding,
          datasetSearchUsingExtensionQuery: false,
          onClose: vi.fn(),
          onSuccess
        })
      );
      await mocks.toggle?.({ target: { checked: true } });
      mocks.complete?.();
      await vi.waitFor(() =>
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            datasetSearchUsingExtensionQuery: true,
            datasetSearchExtensionModelId: 'first-query-model'
          })
        )
      );
    }
  );

  it('does not fill an already-on empty query-extension selection on another checked event', async () => {
    mocks.tab = 'queryExtension';
    mocks.defaultModelId = 'first-query-model';
    mocks.llmModels = [{ modelId: 'first-query-model', model: 'first', name: 'First' }];
    const onSuccess = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        datasetSearchUsingExtensionQuery: true,
        onClose: vi.fn(),
        onSuccess
      })
    );
    await mocks.toggle?.({ target: { checked: true } });
    mocks.complete?.();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('warns and keeps the modal open if enabling cannot find a default', async () => {
    mocks.tab = 'queryExtension';
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        datasetSearchUsingExtensionQuery: false,
        onClose,
        onSuccess
      })
    );
    await mocks.toggle?.({ target: { checked: true } });
    mocks.complete?.();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('allows confirmation without a model when query extension is disabled', async () => {
    mocks.tab = 'queryExtension';
    const onSuccess = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        datasetSearchUsingExtensionQuery: true,
        onClose: vi.fn(),
        onSuccess
      })
    );
    await mocks.toggle?.({ target: { checked: false } });
    mocks.complete?.();
    await vi.waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetSearchUsingExtensionQuery: false
        })
      )
    );
    expect(mocks.toast).not.toHaveBeenCalled();
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
        value: 'rerank-id'
      })
    );
  });

  it('does not fill an already enabled empty rerank model when opening the modal', () => {
    mocks.defaultRerankId = 'rerank-id';
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: true,
        onClose: vi.fn(),
        onSuccess: vi.fn()
      })
    );
    expect(mocks.selectAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelType: ModelTypeEnum.rerank,
        value: undefined
      })
    );
  });

  it('preserves a saved legacy rerank selection without replacing it with a default', () => {
    mocks.defaultRerankId = 'other-default';
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: true,
        rerankModel: 'rerank-model',
        onClose: vi.fn(),
        onSuccess: vi.fn()
      })
    );
    expect(mocks.selectAiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelType: ModelTypeEnum.rerank,
        value: 'rerank-model'
      })
    );
  });

  it('writes and submits the default only when rerank is switched on', async () => {
    mocks.defaultRerankId = 'rerank-id';
    const onSuccess = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: false,
        onClose: vi.fn(),
        onSuccess
      })
    );
    mocks.complete?.();
    await vi.waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ usingReRank: false, rerankModelId: undefined })
      )
    );
    onSuccess.mockClear();
    await mocks.rerankToggle?.({ target: { checked: true } });
    mocks.complete?.();
    await vi.waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ usingReRank: true, rerankModelId: 'rerank-id' })
      )
    );
  });

  it('preserves a nonempty rerank selection when toggling the feature', async () => {
    mocks.defaultRerankId = 'rerank-id';
    const onSuccess = vi.fn();
    renderToStaticMarkup(
      React.createElement(DatasetParamsModal, {
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: false,
        rerankModelId: 'saved-id',
        onClose: vi.fn(),
        onSuccess
      })
    );
    await mocks.rerankToggle?.({ target: { checked: true } });
    mocks.complete?.();
    await vi.waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ usingReRank: true, rerankModelId: 'saved-id' })
      )
    );
  });
});
