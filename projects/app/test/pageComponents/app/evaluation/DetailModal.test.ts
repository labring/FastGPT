import DetailModal from '@/pageComponents/app/evaluation/DetailModal';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('@/web/core/ai/model/useModelSummary', () => ({ useModelSummary: mocks.detail }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: false })
}));
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: () => ({
    data: [],
    Pagination: () => null,
    pageSize: 10,
    total: 0,
    getData: vi.fn()
  })
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chakra-ui/react')>()),
  ModalBody: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

describe('evaluation model display', () => {
  beforeEach(() => {
    mocks.detail.mockReset().mockReturnValue({ loading: false, error: false });
  });
  const render = (evalModelId?: string) =>
    renderToStaticMarkup(
      React.createElement(DetailModal, {
        evalDetail: {
          _id: 'eval',
          name: 'Evaluation',
          appName: 'App',
          executorName: 'User',
          createTime: new Date(),
          evalModelId,
          evalModel: 'old-name',
          completedCount: 0,
          errorCount: 0,
          totalCount: 0
        } as any,
        onClose: vi.fn(),
        fetchEvalList: vi.fn()
      })
    );
  it('shows unconfigured instead of looking up a default or legacy model', () => {
    const html = render();
    expect(mocks.detail).toHaveBeenCalledWith({ modelId: undefined });
    expect(html).toContain('common:not_model_config');
    expect(html).not.toContain('old-name');
  });
  it.each(['active', 'disabled', 'deleted', 'forbidden'])(
    'reuses selector status display for %s',
    (status) => {
      mocks.detail.mockReturnValue({
        loading: false,
        error: false,
        detail: { modelId: 'id', name: 'Selected model', status }
      });
      const html = render('id');
      expect(html).toContain(
        status === 'active'
          ? 'Selected model'
          : status === 'deleted'
            ? 'common:model_delisted'
            : status === 'disabled'
              ? 'common:model_disabled'
              : 'common:model_forbidden'
      );
    }
  );
});
