import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { act, createContext, createElement, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CanvasOverlays } from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/WorkflowCanvas';

const panel = createContext<'nodeTemplates' | undefined>(undefined);

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/hooks/useWorkflowBuilderUI',
  () => ({
    useWorkflowBuilderUI: () => ({
      activeLeftPanel: useContext(panel),
      workflowCanvasRef: { current: null }
    })
  })
);
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/panels/workflowPanelState', () => ({
  useWorkflowModalValue: () => vi.fn()
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/NodeTemplatesModal', () => ({
  default: () => null,
  sliderWidth: 320
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/NodeTemplatesPopover', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/SystemConfigDrawer', () => ({
  default: () => null,
  SystemConfigButton: () => null
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/WorkflowBuilderEntry',
  () => ({
    default: () => null
  })
);
vi.mock('@/pageComponents/app/detail/Workflow/components/SearchButton', () => ({
  default: () => null
}));

it('makes the canvas toolbar inert while a side panel is open', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  dom.window.matchMedia = vi.fn((query: string) => ({
    media: query,
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const renderToolbar = (activePanel?: 'nodeTemplates') =>
    act(() =>
      root.render(
        createElement(
          ChakraProvider,
          null,
          createElement(panel.Provider, { value: activePanel }, createElement(CanvasOverlays))
        )
      )
    );

  try {
    await renderToolbar();
    const toolbar = container
      .querySelector('button[aria-label="workflow:to_add_node"]')
      ?.closest('[aria-hidden]');
    expect(toolbar?.hasAttribute('inert')).toBe(false);

    await renderToolbar('nodeTemplates');
    expect(toolbar?.hasAttribute('inert')).toBe(true);

    await renderToolbar();
    expect(toolbar?.hasAttribute('inert')).toBe(false);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
