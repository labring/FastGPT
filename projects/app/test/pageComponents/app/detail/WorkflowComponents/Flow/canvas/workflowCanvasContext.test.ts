import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import WorkflowCanvasProvider, {
  useWorkflowCanvasRendererValue,
  useWorkflowCanvasValue
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext';
import type { NodeDimensions } from '@/pageComponents/app/detail/WorkflowComponents/Flow/canvas/nodeDimensions';

const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  runtime: {
    isDisposed: () => false,
    subscribe: () => () => {},
    getNode: () => undefined
  },
  overlaysRef: { current: {} },
  issueFocusRef: { current: undefined }
}));
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xyflow/react')>()),
  useNodesInitialized: () => false,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 100, height: 100 }),
  useReactFlow: () => ({})
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => mocks.runtime,
  useWorkflowViewTick: () => 0,
  useWorkflowOverlayRef: () => mocks.overlaysRef,
  useWorkflowIssueFocusRef: () => mocks.issueFocusRef
}));
vi.mock('@/web/core/workflow/editor/canvas/projectWorkflowCanvas', () => ({
  createProjectionCache: () => ({}),
  projectRuntimeCanvas: () => ({ nodes: mocks.nodes, edges: [] })
}));

describe('full canvas container measurements', () => {
  let dom: JSDOM;
  let root: Root;
  let frames: Map<number, FrameRequestCallback>;
  let dimensions: ReadonlyMap<string, NodeDimensions>;
  let renderedIds: string[];

  const Measurement = ({ nodeId }: { nodeId: string }) => {
    const register = useWorkflowCanvasValue((value) => value.registerNodeMeasurement);
    useEffect(() => {
      const registration = register(nodeId);
      registration.report({
        card: { width: 366, height: 400 },
        occupied: { width: 366, height: 400 },
        containerContentOffset: { x: 33, y: 100 },
        containerContentSize: { width: 300, height: 200 }
      });
      return registration.dispose;
    }, [nodeId, register]);
    return null;
  };
  const Harness = () => {
    dimensions = useWorkflowCanvasValue((value) => value.nodeDimensions);
    const nodes = useWorkflowCanvasRendererValue((value) => value.renderedNodes);
    renderedIds = nodes.map(({ id }) => id);
    return createElement(
      'div',
      null,
      ...nodes.map(({ id }) => createElement(Measurement, { key: id, nodeId: id }))
    );
  };
  const node = (id: string, parentNodeId?: string): CanvasNode => ({
    id,
    type: parentNodeId ? FlowNodeTypeEnum.answerNode : FlowNodeTypeEnum.loopRun,
    position: { x: 10000, y: 10000 },
    data: {
      nodeId: id,
      parentNodeId,
      name: id,
      intro: '',
      avatar: '',
      flowNodeType: parentNodeId ? FlowNodeTypeEnum.answerNode : FlowNodeTypeEnum.loopRun
    }
  });

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    frames = new Map();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    root = createRoot(document.getElementById('root')!);
    mocks.nodes = [
      node('first-container'),
      node('first-child', 'first-container'),
      node('second-container'),
      node('second-child', 'second-container'),
      { ...node('folded-container'), data: { ...node('folded-container').data, isFolded: true } },
      node('folded-child', 'folded-container')
    ];
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each([50, 51])(
    'measures every offscreen container only in full mode (%i nodes)',
    async (count) => {
      while (mocks.nodes.length < count) {
        mocks.nodes.push(node(`filler-${mocks.nodes.length}`, 'first-container'));
      }
      await act(async () =>
        root.render(createElement(WorkflowCanvasProvider, null, createElement(Harness)))
      );
      await act(async () => {
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(0));
      });

      if (count === 50) {
        expect(renderedIds).toHaveLength(49);
        for (const id of [
          'first-container',
          'first-child',
          'second-container',
          'second-child',
          'folded-container'
        ]) {
          expect(dimensions.get(id)?.containerContentOffset).toEqual({ x: 33, y: 100 });
          expect(dimensions.get(id)?.containerContentSize).toEqual({ width: 300, height: 200 });
        }
      } else {
        expect(renderedIds).toEqual([]);
        expect(dimensions.size).toBe(0);
      }
      expect(renderedIds).not.toContain('folded-child');
      expect(dimensions.has('folded-child')).toBe(false);
    }
  );
});
