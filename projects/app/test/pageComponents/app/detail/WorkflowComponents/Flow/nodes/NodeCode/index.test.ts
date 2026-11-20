import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ChakraProvider } from '@chakra-ui/react';
import { expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import { WorkflowEditorProvider } from '@/web/core/workflow/editor/react/workflowEditorProvider';
import NodeCode from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/IOTitle', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-node': 'code' }, children)
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput', () => ({
  default: ({
    flowInputList,
    CustomComponent
  }: {
    flowInputList: FlowNodeInputItemType[];
    CustomComponent: Record<string, (input: FlowNodeInputItemType) => React.ReactNode>;
  }) =>
    flowInputList.map((input) =>
      React.createElement(React.Fragment, { key: input.key }, CustomComponent[input.key]?.(input))
    )
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderOutput', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/common/Textarea/CodeEditor', () => ({
  default: ({ value }: { value?: string }) => React.createElement('span', { 'data-code': value })
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderToolInput', () => ({
  default: () => null,
  useHasDynamicToolInput: () => false
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/useWorkflowDocument',
  () => ({
    useIsToolNode: () => false
  })
);

const createNodeCodeFixture = () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const canvas = document.getElementById('root')!;
  const root = createRoot(canvas);
  const node = {
    nodeId: 'code',
    name: 'Code',
    flowNodeType: FlowNodeTypeEnum.code,
    catchError: false,
    inputs: [
      { key: NodeInputKeyEnum.code, label: '', renderTypeList: [FlowNodeInputTypeEnum.custom] }
    ],
    outputs: []
  };
  const runtime = hydrateRuntime({ input: { nodes: [node], edges: [] }, t: (key) => key });
  const renderNode = async () => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(
            WorkflowEditorProvider,
            { runtime },
            React.createElement(NodeCode, { data: node } as React.ComponentProps<typeof NodeCode>)
          )
        )
      );
    });
  };
  const dispose = async () => {
    await act(async () => root.unmount());
    runtime.dispose();
    dom.window.close();
    vi.unstubAllGlobals();
  };
  return { canvas, root, runtime, renderNode, dispose };
};

it('tolerates a deleted runtime node while the previous canvas props are still mounted', async () => {
  const { canvas, runtime, renderNode, dispose } = createNodeCodeFixture();
  try {
    await renderNode();
    expect(canvas.querySelector('[data-node="code"]')).not.toBeNull();

    await act(async () => {
      expect(runtime.getWorkflowActions().removeNodes(['code']).ok).toBe(true);
    });
    expect(runtime.getNode('code')).toBeUndefined();
  } finally {
    await dispose();
  }
});

it('clears the code editor on remount after undo restores a missing value', async () => {
  const { canvas, root, runtime, renderNode, dispose } = createNodeCodeFixture();
  const field = runtime.getFieldHandle({ nodeId: 'code', fieldKey: NodeInputKeyEnum.code })!;
  try {
    expect(field.data.input?.value).toBeUndefined();
    await renderNode();
    await act(async () => {
      field.setValue('function main() {}');
    });
    expect(canvas.querySelector('[data-code]')?.getAttribute('data-code')).toBe(
      'function main() {}'
    );
    await act(async () => {
      expect(runtime.undo().ok).toBe(true);
      root.render(null);
    });
    await renderNode();
    expect(canvas.querySelector('[data-code]')?.getAttribute('data-code')).toBe('');
  } finally {
    await dispose();
  }
});
