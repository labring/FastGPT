import { ChakraProvider } from '@chakra-ui/react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { JSDOM } from 'jsdom';
import { act, createContext, createElement, useContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkflowCanvas, {
  CanvasOverlays
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/WorkflowCanvas';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas/canvasTypes';

const panel = createContext<'nodeTemplates' | undefined>(undefined);
const canvasState = vi.hoisted(() => ({
  runtime: {},
  nodes: [] as CanvasNode[],
  fitNodes: vi.fn(),
  focusNodes: vi.fn()
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  ReactFlow: () => null
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => canvasState.runtime
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext', () => ({
  useWorkflowCanvasRendererValue: (selector: (value: unknown) => unknown) =>
    selector({ nodes: canvasState.nodes, renderedNodes: canvasState.nodes, renderedEdges: [] }),
  useWorkflowCanvasValue: (selector: (value: unknown) => unknown) => selector(canvasState)
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/canvasState', () => ({
  useWorkflowUIValue: (selector: (value: unknown) => unknown) =>
    selector({ workflowControlMode: 'drag' })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/useCanvasController', () => ({
  useCanvasController: () => ({})
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflowAutoLayout', () => ({
  useWorkflowAutoLayout: () => ({})
}));
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

let dom: JSDOM;
let container: HTMLElement;
let root: Root;
const render = (child: ReactNode) =>
  act(() => root.render(createElement(ChakraProvider, null, child)));

beforeEach(() => {
  vi.clearAllMocks();
  canvasState.nodes = [];
  dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
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
  container = document.getElementById('root')!;
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

it('makes the canvas toolbar inert while a side panel is open', async () => {
  const renderToolbar = (activePanel?: 'nodeTemplates') =>
    render(createElement(panel.Provider, { value: activePanel }, createElement(CanvasOverlays)));

  await renderToolbar();
  const toolbar = container
    .querySelector('button[aria-label="workflow:to_add_node"]')
    ?.closest('[aria-hidden]');
  expect(toolbar?.hasAttribute('inert')).toBe(false);

  await renderToolbar('nodeTemplates');
  expect(toolbar?.hasAttribute('inert')).toBe(true);

  await renderToolbar();
  expect(toolbar?.hasAttribute('inert')).toBe(false);
});

const node = (id: string, selected: boolean): CanvasNode => ({
  id,
  selected,
  position: { x: 0, y: 0 },
  data: { nodeId: id, name: id, flowNodeType: FlowNodeTypeEnum.emptyNode, avatar: '', intro: '' }
});

it.each([
  { selectedIds: [], focusesSelection: false },
  { selectedIds: ['first'], focusesSelection: true },
  { selectedIds: ['first', 'second'], focusesSelection: false }
])(
  'uses the selection $selectedIds when returning to the editor',
  async ({ selectedIds, focusesSelection }) => {
    canvasState.nodes = [node('first', false), node('second', false)];
    await render(createElement(WorkflowCanvas));
    await render(null);

    canvasState.nodes = ['first', 'second'].map((id) => node(id, selectedIds.includes(id)));
    vi.clearAllMocks();
    await render(createElement(WorkflowCanvas));

    if (focusesSelection) {
      expect(canvasState.focusNodes).toHaveBeenCalledExactlyOnceWith(
        selectedIds,
        expect.objectContaining({ maxZoom: 1 })
      );
      expect(canvasState.fitNodes).not.toHaveBeenCalled();
    } else {
      expect(canvasState.focusNodes).not.toHaveBeenCalled();
      expect(canvasState.fitNodes).toHaveBeenCalledOnce();
    }
  }
);
