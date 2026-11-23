import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  useNodeAnchoredHandle,
  useNodeHandleLayout
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleLayout';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@xyflow/react', () => ({ useUpdateNodeInternals: () => mocks.update }));

describe('useNodeHandleLayout', () => {
  let dom: JSDOM;
  let root: Root;
  const node: FlowNodeItemType = {
    id: 'node',
    nodeId: 'node',
    flowNodeType: FlowNodeTypeEnum.emptyNode,
    name: 'Node',
    avatar: '',
    intro: '',
    inputs: [],
    outputs: []
  };
  const Harness = (props: Parameters<typeof useNodeHandleLayout>[0]) => {
    useNodeHandleLayout(props);
    return createElement('div');
  };
  const render = async (props: Partial<Parameters<typeof useNodeHandleLayout>[0]> = {}) => {
    await act(async () =>
      root.render(
        createElement(Harness, { node, toolConnected: false, language: 'zh-CN', ...props })
      )
    );
  };

  beforeEach(() => {
    mocks.update.mockClear();
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('refreshes after committed configuration changes, without observing arbitrary DOM mutations', async () => {
    const observe = vi.spyOn(dom.window.MutationObserver.prototype, 'observe');
    await render();
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('node');
    mocks.update.mockClear();
    document.getElementById('root')!.append(document.createElement('span'));
    await render({ node: { ...node } });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();

    for (const patch of [
      { inputs: [...node.inputs] },
      { outputs: [...node.outputs] },
      { isFolded: true },
      { catchError: true },
      { showSourceHandle: true },
      { showTargetHandle: true },
      { name: 'Changed' },
      { intro: 'Changed' }
    ]) {
      mocks.update.mockClear();
      await render({ node: { ...node, ...patch } });
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith('node');
    }
    mocks.update.mockClear();
    await render({ toolConnected: true });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('node');
    mocks.update.mockClear();
    await render({ toolConnected: true, language: 'en' });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('node');
  });

  it('moves the real portal when equal-height rows are reordered', async () => {
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
    vi.spyOn(dom.window.HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
    vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.parentElement?.hasAttribute('data-workflow-node-card')) {
          return new dom.window.DOMRect(100, this.previousElementSibling ? 260 : 180, 600, 80);
        }
        return new dom.window.DOMRect(100, 120, 600, 360);
      }
    );
    const Branch = ({ name }: { name: string }) => {
      const { rowRef, anchor } = useNodeAnchoredHandle(true);
      return createElement(
        'div',
        null,
        createElement('span', { ref: rowRef }),
        anchor &&
          createPortal(
            createElement('span', { id: name, style: { top: anchor.top, left: anchor.left } }),
            anchor.node
          )
      );
    };
    const renderBranches = async (names: string[]) =>
      act(async () =>
        root.render(
          createElement(
            'div',
            { className: 'react-flow__node' },
            createElement(
              'div',
              { 'data-workflow-node-card': true },
              ...names.map((name) => createElement(Branch, { key: name, name }))
            )
          )
        )
      );

    await renderBranches(['if', 'else']);
    const ifHandle = document.getElementById('if')!;
    const elseHandle = document.getElementById('else')!;
    expect(ifHandle.parentElement?.className).toBe('react-flow__node');
    expect(ifHandle.style.left).toBe('300px');
    expect([ifHandle.style.top, elseHandle.style.top]).toEqual(['50px', '90px']);

    await renderBranches(['else', 'if']);
    expect([ifHandle.style.top, elseHandle.style.top]).toEqual(['90px', '50px']);
  });
});
