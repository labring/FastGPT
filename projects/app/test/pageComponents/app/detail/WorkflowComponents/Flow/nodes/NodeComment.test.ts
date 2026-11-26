import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import { WorkflowEditorProvider } from '@/web/core/workflow/editor/react/workflowEditorProvider';
import NodeComment from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeComment';

vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Box: ({
    children,
    className,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture
  }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement(
      'div',
      {
        className,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onLostPointerCapture
      },
      children
    ),
  Textarea: ({ value, onChange }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    React.createElement('textarea', { value, onChange })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children, minW, minH }: { children: React.ReactNode; minW: string; minH: string }) =>
    React.createElement('div', { 'data-minw': minW, 'data-minh': minH }, children)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: () => React.createElement('span')
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const initialSize = { width: 240, height: 140 };
const commentNode = {
  nodeId: 'comment',
  flowNodeType: FlowNodeTypeEnum.comment,
  name: 'Comment',
  inputs: [
    {
      key: NodeInputKeyEnum.commentText,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      value: 'note'
    },
    {
      key: NodeInputKeyEnum.commentSize,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      value: initialSize
    }
  ],
  outputs: []
};

describe('NodeComment resize', () => {
  let root: Root;
  let dom: JSDOM;
  let container: HTMLDivElement;
  let runtime: ReturnType<typeof hydrateRuntime>;
  let resizer: HTMLDivElement;

  const pointer = (type: string, { id = 1, x = 0, y = 0 } = {}) =>
    resizer.dispatchEvent(
      Object.assign(new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), {
        pointerId: id
      })
    );

  const getSize = () =>
    runtime.getField({
      nodeId: commentNode.nodeId,
      fieldKey: NodeInputKeyEnum.commentSize,
      kind: 'input'
    })?.input?.value;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    root = createRoot(container);
    runtime = hydrateRuntime({ input: { nodes: [commentNode], edges: [] }, t: (key) => key });
    act(() =>
      root.render(
        React.createElement(
          WorkflowEditorProvider,
          { runtime },
          React.createElement(NodeComment, { data: commentNode } as React.ComponentProps<
            typeof NodeComment
          >)
        )
      )
    );
    resizer = container.querySelector<HTMLDivElement>('.nodrag')!;
    resizer.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    runtime.dispose();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('previews pointer movement and commits one undoable size change on pointer up', () => {
    const initialUndoCount = runtime.getHistory().undoCount;

    act(() => {
      pointer('pointerdown', { x: 10, y: 10 });
      pointer('pointermove', { x: 25, y: 20 });
      pointer('pointermove', { x: 40, y: 30 });
    });
    expect(container.querySelector('[data-minw]')?.getAttribute('data-minw')).toBe('270px');
    expect(getSize()).toEqual(initialSize);
    expect(runtime.getHistory().undoCount).toBe(initialUndoCount);

    act(() => {
      pointer('pointerup');
    });

    expect(resizer.setPointerCapture).toHaveBeenCalledWith(1);
    expect(getSize()).toEqual({ width: 270, height: 160 });
    expect(runtime.getHistory().undoCount).toBe(initialUndoCount + 1);

    // Undo restores the document field; the canvas size must follow that snapshot too.
    act(() => {
      runtime.undo();
    });
    expect(getSize()).toEqual(initialSize);
    expect(container.querySelector('[data-minw]')?.getAttribute('data-minw')).toBe('240px');
    expect(container.querySelector('[data-minh]')?.getAttribute('data-minh')).toBe('140px');
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    'ignores unrelated pointers and restores the document size on %s',
    (cancelEvent) => {
      act(() => {
        pointer('pointerdown');
        pointer('pointermove', { x: 20, y: 20 });
        pointer('pointermove', { id: 2, x: 100, y: 100 });
        pointer('pointerup', { id: 2 });
      });
      expect(container.querySelector('[data-minw]')?.getAttribute('data-minw')).toBe('260px');
      expect(getSize()).toEqual(initialSize);

      act(() => {
        pointer(cancelEvent);
        pointer('pointermove', { x: 100, y: 100 });
        pointer('pointerup');
      });
      expect(container.querySelector('[data-minw]')?.getAttribute('data-minw')).toBe('240px');
      expect(getSize()).toEqual(initialSize);
      expect(runtime.getHistory().canUndo).toBe(false);
    }
  );
});
