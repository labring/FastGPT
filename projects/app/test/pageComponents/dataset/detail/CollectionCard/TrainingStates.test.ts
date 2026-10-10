import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createTrainingDetail as createDetail } from './fixtures';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import { Permission } from '@fastgpt/global/support/permission/controller';

const mocks = vi.hoisted(() => ({
  trainingDetail: undefined as unknown,
  onSuccess: undefined as ((data: unknown) => void) | undefined
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (_request: unknown, options: { onSuccess?: (data: unknown) => void }) => {
    mocks.onSuccess = options.onSuccess;
    return { data: mocks.trainingDetail, loading: false, run: vi.fn() };
  }
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === 'dataset:process.Index_Rebuild') return '索引重建';
      if (key === 'dataset:process.Synonym_Rebuild') return '同义词重建';
      if (key === 'dataset:process.Is_Ready') return '已就绪';
      if (key === 'dataset:dataset.Training_Waiting') return `需等待 ${options?.count} 组数据`;
      if (key === 'dataset:dataset.Training_Count') return `${options?.count} 条处理中`;
      if (key === 'dataset:training.Error') return `${options?.count} 组异常`;
      return key;
    }
  })
}));
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children, bg }: { children?: React.ReactNode; bg?: string }) =>
    React.createElement('div', { 'data-bg': bg }, children);
  return { Box, Flex: Box, ModalBody: Box };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));
vi.mock('@fastgpt/web/components/common/Tag/index', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children)
}));
vi.mock('@fastgpt/web/components/common/Tabs/FillRowTabs', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('i', { 'data-icon': name })
}));
vi.mock('@/pageComponents/dataset/detail/CollectionCard/TrainingErrorList', () => ({
  default: () => null
}));

const TrainingStates = (
  await import('@/pageComponents/dataset/detail/CollectionCard/TrainingStates')
).default;

describe('TrainingStates rebuild stage', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (detail: GetCollectionTrainingDetailResponseType) => {
    mocks.trainingDetail = detail;
    await act(async () =>
      root.render(
        React.createElement(TrainingStates, {
          collectionId: 'collection',
          permission: new Permission(),
          onClose: vi.fn()
        })
      )
    );
    await act(async () => mocks.onSuccess?.(detail));
  };
  const rebuildRow = (label = '索引重建') =>
    Array.from(container.querySelectorAll('[data-bg]')).find((element) =>
      element.textContent?.includes(label)
    );
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    window.close();
    vi.unstubAllGlobals();
  });

  it('does not add a rebuild stage for ordinary indexing', async () => {
    const detail = createDetail();
    detail.trainingCounts.index = 2;
    await render(detail);
    expect(rebuildRow()).toBeUndefined();
  });

  it.each(['rebuildIndex', 'rebuildSynonym'] as const)(
    'keeps the observed %s stage checked until the modal closes',
    async (mode) => {
      const label = mode === 'rebuildIndex' ? '索引重建' : '同义词重建';
      const queued = createDetail();
      queued.trainingCounts[mode] = 7;
      await render(queued);
      expect(rebuildRow(label)?.textContent).toContain('7 条处理中');
      expect(
        rebuildRow(label)?.parentElement?.querySelector('[data-icon="common/check"]')
      ).toBeNull();

      const running = createDetail();
      running.trainingCounts[mode] = 2;
      await render(running);
      expect(rebuildRow(label)?.textContent).toContain('2 条处理中');

      const completed = createDetail();
      completed.trainedCount = 7;
      await render(completed);
      expect(rebuildRow(label)).toBeDefined();
      expect(
        rebuildRow(label)?.parentElement?.querySelector('[data-icon="common/check"]')
      ).not.toBeNull();
      expect(rebuildRow(label)?.textContent).not.toContain('组数据');
      expect(rebuildRow(label)?.textContent).not.toContain('条处理中');
      await act(async () => root.render(null));
      await render(completed);
      expect(rebuildRow(label)).toBeUndefined();
    }
  );
  it.each(['rebuildIndex', 'rebuildSynonym'] as const)(
    'merges pending and processing in the two-step %s flow, including failed-only rounds',
    async (mode) => {
      const detail = createDetail();
      detail.trainingType = DatasetCollectionDataProcessModeEnum.qa;
      detail.advancedTraining.imageIndex = true;
      detail.advancedTraining.autoIndexes = true;
      detail.queuedCounts[mode] = 3;
      await render(detail);
      const labels = () =>
        Array.from(container.querySelectorAll('[data-bg]'))
          .map((row) => row.textContent)
          .filter(Boolean);
      const rebuildLabel = mode === 'rebuildIndex' ? '索引重建' : '同义词重建';
      expect(labels()).toEqual([`${rebuildLabel}3 条处理中`, '已就绪dataset:training_ready']);
      detail.trainingCounts[mode] = 2;
      await render(detail);
      expect(labels()).toEqual([`${rebuildLabel}5 条处理中`, '已就绪dataset:training_ready']);
      expect(container.textContent).not.toContain('待重建');
      expect(container.textContent).not.toContain('process.Parsing');
      expect(container.textContent).not.toContain('process.Get QA');
      expect(container.textContent).not.toContain('process.Auto_Index');

      detail.errorCounts[mode] = 1;
      await render(detail);
      expect(labels()).toEqual([
        `${rebuildLabel}1 组异常5 条处理中`,
        '已就绪dataset:training_ready'
      ]);
      expect(container.querySelector('[data-bg="red.50"]')?.textContent).toContain(rebuildLabel);

      detail.queuedCounts[mode] = 0;
      detail.trainingCounts[mode] = 0;
      detail.errorCounts[mode] = 2;
      await render(detail);
      expect(labels()).toEqual([`${rebuildLabel}2 组异常`, '已就绪dataset:training_ready']);
      expect(container.querySelector('[data-bg="red.50"]')?.textContent).toContain(rebuildLabel);
    }
  );

  it('shows each rebuild flow separately when both modes are present', async () => {
    const detail = createDetail();
    detail.queuedCounts.rebuildIndex = 2;
    detail.queuedCounts.rebuildSynonym = 2;
    detail.trainingCounts.rebuildSynonym = 1;
    detail.errorCounts.rebuildSynonym = 1;
    await render(detail);
    const rows = Array.from(container.querySelectorAll('[data-bg]'))
      .map((row) => row.textContent)
      .filter(Boolean);
    expect(rows).toEqual([
      '索引重建2 条处理中',
      '已就绪dataset:training_ready',
      '同义词重建1 组异常3 条处理中',
      '已就绪dataset:training_ready'
    ]);
    detail.queuedCounts.rebuildIndex = 0;
    await render(detail);
    const index = rebuildRow()!;
    expect(index.parentElement?.querySelector('[data-icon="common/check"]')).not.toBeNull();
  });

  it('preserves the configured import stages for new imports and their errors', async () => {
    const detail = createDetail();
    detail.trainingType = DatasetCollectionDataProcessModeEnum.qa;
    detail.advancedTraining.imageIndex = true;
    detail.advancedTraining.autoIndexes = true;
    detail.errorCounts.qa = 1;
    await render(detail);
    expect(container.textContent).toContain('process.Parsing');
    expect(container.textContent).toContain('process.Get QA');
    expect(container.textContent).toContain('process.Image_Index');
    expect(container.textContent).toContain('process.Auto_Index');
    expect(container.textContent).toContain('process.Vectorizing');
    expect(container.textContent).not.toContain('待重建');
    expect(container.querySelector('[data-bg="red.50"]')?.textContent).toContain('process.Get QA');
  });
  it('keeps image parsing stages for newly imported images', async () => {
    const detail = createDetail();
    detail.trainingType = DatasetCollectionDataProcessModeEnum.imageParse;
    detail.queuedCounts.imageParse = 2;
    await render(detail);
    expect(container.textContent).toContain('process.Parse_Image');
    expect(container.textContent).toContain('需等待 2 组数据');
    expect(container.textContent).not.toContain('待重建');
  });

  it('does not append rebuilding to the import chain when both are active', async () => {
    const detail = createDetail();
    detail.trainingCounts.index = 1;
    detail.queuedCounts.rebuildIndex = 2;
    await render(detail);
    const rows = Array.from(container.querySelectorAll('[data-bg]'))
      .map((row) => row.textContent)
      .filter(Boolean);
    expect(rows).toEqual([
      'dataset:process.Parsing',
      'dataset:process.Vectorizing1 条处理中',
      '已就绪dataset:training_ready',
      '索引重建2 条处理中',
      '已就绪dataset:training_ready'
    ]);
  });
});
