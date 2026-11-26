import React, { act, createElement, type PropsWithChildren, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import ImportSettings from '@/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings';

const rejectionMessage = 'Duplicate workflow node id: repeated';

const mocks = vi.hoisted(() => ({
  loadDocument: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@/pageComponents/dashboard/agent/utils/appTemplateParse', () => ({
  parseWorkflowImportConfig: async () => ({ nodes: [], edges: [], chatConfig: {} })
}));
vi.mock('@/web/core/ai/model/modelData', () => ({ getModelList: async () => [] }));
vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return { AppContext: createContext({ appDetail: { chatConfig: {}, type: 'workflow' } }) };
});
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowSessionActions: () => ({ loadDocument: mocks.loadDocument })
}));
vi.mock('@/web/core/workflow/editor/codec', () => ({
  materializeWorkflow: ({ input }: { input: unknown }) => input
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: PropsWithChildren) => createElement('div', null, children),
  Button: ({ children, onClick }: PropsWithChildren<{ onClick: () => void }>) =>
    createElement('button', { onClick }, children)
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: PropsWithChildren<{ footer: ReactNode }>) =>
    createElement('div', null, children, footer)
}));
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
      createElement('textarea', { value, readOnly: true, onClick: () => onChange('{}') })
}));

it('keeps the import input open and reports the localized failure when Runtime rejects it', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = dom.window.document.getElementById('root')!;
  const root = createRoot(host);
  const onClose = vi.fn();
  mocks.loadDocument.mockReturnValue({ ok: false, error: { message: rejectionMessage } });

  try {
    await act(async () => root.render(createElement(ImportSettings, { onClose })));
    const input = host.querySelector('textarea')!;
    await act(async () => input.click());
    await act(async () => host.querySelector('button')!.click());

    expect(mocks.loadDocument).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'app:import_configs_failed',
      description: expect.objectContaining({
        props: expect.objectContaining({ children: rejectionMessage })
      }),
      status: 'error'
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(input.value).toBe('{}');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
