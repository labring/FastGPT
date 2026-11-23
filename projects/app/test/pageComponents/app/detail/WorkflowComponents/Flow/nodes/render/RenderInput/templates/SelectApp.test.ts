import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import SelectApp from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SelectApp';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn((_options: { onError: (error: unknown) => void }) => ({ isLoading: false })),
  setValue: vi.fn(),
  toast: vi.fn(),
  translate: vi.fn((key: string) => key)
}));

vi.mock('@chakra-ui/react', () => ({
  Box: () => null,
  Button: () => null,
  useDisclosure: () => ({ isOpen: false }),
  useToast: () => mocks.toast
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate, i18n: { language: 'zh-Hant' } })
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('use-context-selector', () => ({ useContextSelector: () => 'current-app' }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/SelectAppModal', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext', () => ({
  useWorkflowCanvasValue: () => false
}));
vi.mock('@/web/core/app/api', () => ({ getAppDetailById: vi.fn() }));
vi.mock('@/web/core/workflow/editor/react/useField', () => ({
  useField: () => ({ value: { id: 'selected-app' } }),
  useFieldActions: () => ({ setValue: mocks.setValue })
}));

describe('workflow app selection errors', () => {
  it('clears failed selections and translates the localized error once', () => {
    renderToStaticMarkup(
      createElement(SelectApp, {
        nodeId: 'run-app',
        item: { key: 'app', label: 'App', renderTypeList: [] }
      })
    );
    const { onError } = mocks.useQuery.mock.lastCall![0];

    onError({
      error: { reason: { en: 'Not available', 'zh-CN': '不可用', 'zh-Hant': '無法使用' } }
    });
    onError(new ToastHandledError('Already shown'));

    expect(mocks.setValue.mock.calls).toEqual([[undefined], [undefined]]);
    expect(mocks.translate.mock.calls).toEqual([['無法使用']]);
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: '無法使用', status: 'error' })
    );
  });
});
