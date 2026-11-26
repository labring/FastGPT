import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const mocks = vi.hoisted(() => ({ nodes: new Map<string, FlowNodeItemType>() }));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({ Box: ({ children }: { children?: unknown }) => children }));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (nodeId: string, selector: (node: unknown) => unknown) =>
    selector(mocks.nodes.has(nodeId) ? { data: mocks.nodes.get(nodeId) } : undefined)
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children?: unknown }) => children
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference',
  () => ({ default: () => null })
);

import NodeLoopEnd from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopEnd';

const createParentNode = (): FlowNodeItemType => ({
  nodeId: 'parent',
  name: 'Parent',
  flowNodeType: FlowNodeTypeEnum.loop,
  inputs: [],
  outputs: [
    {
      id: 'loopArray',
      key: 'loopArray',
      label: 'Result',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayString
    }
  ]
});

const renderLoopEnd = (value: unknown) => {
  const parent = createParentNode();
  mocks.nodes.set(parent.nodeId, parent);
  const data: FlowNodeItemType = {
    nodeId: 'loopEnd',
    parentNodeId: parent.nodeId,
    flowNodeType: FlowNodeTypeEnum.nestedEnd,
    name: 'End',
    inputs: [
      {
        key: NodeInputKeyEnum.nestedEndInput,
        label: 'Result',
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        valueType: WorkflowIOValueTypeEnum.any,
        value: value as any
      }
    ],
    outputs: []
  };
  const Component = (NodeLoopEnd as any).type;
  return { element: Component({ data, selected: false }), parent };
};

describe('NodeLoopEnd', () => {
  beforeEach(() => mocks.nodes.clear());

  it.each([undefined, null, [], [undefined, undefined], ['child-node', undefined]])(
    'renders incomplete loopEndInput value (%j) safely without writing parent outputs',
    (value) => {
      expect(() => renderLoopEnd(value)).not.toThrow();
      expect(mocks.nodes.get('parent')?.outputs[0].valueType).toBe(
        WorkflowIOValueTypeEnum.arrayString
      );
    }
  );

  it('does not derive parent output types during render', () => {
    const { parent } = renderLoopEnd(['child-node', 'out-1']);

    expect(parent.outputs[0].valueType).toBe(WorkflowIOValueTypeEnum.arrayString);
  });
});
