import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  onChangeNode: vi.fn(),
  nodesMap: new Map<string, FlowNodeItemType>(),
  chatConfig: {} as Record<string, any>
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('use-context-selector', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useContextSelector: (_: unknown, select: (data: any) => unknown) =>
    select({
      onChangeNode: mocks.onChangeNode,
      getNodeById: (id?: string | null) => (id ? mocks.nodesMap.get(id) : undefined),
      appDetail: { chatConfig: mocks.chatConfig }
    })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children?: unknown }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowBufferDataContext: {}
}));
vi.mock('@/pageComponents/app/detail/context', () => ({
  AppContext: {}
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (nodeId: string, selector: (node: unknown) => unknown) =>
    selector(mocks.nodesMap.has(nodeId) ? { data: mocks.nodesMap.get(nodeId) } : undefined),
  useNodeActions: (nodeId: string) => ({
    updateNode: (patch: (node: FlowNodeItemType) => { outputs?: FlowNodeItemType['outputs'] }) => {
      const current = mocks.nodesMap.get(nodeId);
      if (!current) return;
      const result = patch(current);
      if (result.outputs) {
        mocks.nodesMap.set(nodeId, { ...current, outputs: result.outputs });
      }
    }
  })
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowRuntime: () => ({
    isDisposed: () => false,
    getNode: (nodeId: string) => mocks.nodesMap.get(nodeId)
  })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children?: unknown }) => children
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/Reference',
  () => ({
    default: () => null
  })
);

import NodeLoopEnd from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/Loop/NodeLoopEnd';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';

const t = ((key: string) => key) as any;

const createParentNode = ({
  nodeId = 'parent-node',
  flowNodeType = FlowNodeTypeEnum.parallelRun,
  outputValueType = WorkflowIOValueTypeEnum.arrayAny
}: {
  nodeId?: string;
  flowNodeType?: FlowNodeTypeEnum.parallelRun | FlowNodeTypeEnum.loop;
  outputValueType?: WorkflowIOValueTypeEnum;
} = {}): FlowNodeItemType => {
  const outputKey =
    flowNodeType === FlowNodeTypeEnum.parallelRun
      ? NodeOutputKeyEnum.parallelSuccessResults
      : NodeOutputKeyEnum.nestedArrayResult;

  return {
    nodeId,
    name: 'Parent',
    flowNodeType,
    inputs: [],
    outputs: [
      {
        id: outputKey,
        key: outputKey,
        label: outputKey,
        type: FlowNodeOutputTypeEnum.static,
        valueType: outputValueType
      }
    ]
  } as FlowNodeItemType;
};

const renderLoopEnd = (data: FlowNodeItemType) => {
  mocks.nodesMap.set(data.nodeId, data);
  const Component = (NodeLoopEnd as any).type;
  const element = Component({ data, selected: false });
  mocks.effects.forEach((effect) => effect());
  return element;
};

describe('NodeLoopEnd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects = [];
    mocks.nodesMap.clear();
    mocks.chatConfig = {};
  });

  it('does not crash when persisted loopEndInput is missing value field (app_versions regression)', () => {
    const parentNode = createParentNode({ nodeId: 'r2I5Ri190p7JCqAY' });
    mocks.nodesMap.set(parentNode.nodeId, parentNode);

    const storedLoopEnd: StoreNodeItemType = {
      nodeId: 'z6Yx5ZpSLrEZreH4',
      parentNodeId: parentNode.nodeId,
      name: 'workflow:loop_end',
      flowNodeType: FlowNodeTypeEnum.nestedEnd,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: NodeInputKeyEnum.nestedEndInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.any,
          label: '',
          required: true
          // Intentionally omit `value` to match persisted app_versions after reference cleanup
        }
      ],
      outputs: []
    };

    const flowNode = storeNode2FlowNode({
      item: storedLoopEnd,
      parentNodeId: storedLoopEnd.parentNodeId,
      t
    });

    expect(
      flowNode.data.inputs.find((item) => item.key === NodeInputKeyEnum.nestedEndInput)?.value
    ).toBeUndefined();
    expect(() => renderLoopEnd(flowNode.data)).not.toThrow();
    expect(mocks.onChangeNode).not.toHaveBeenCalled();
  });

  it.each([undefined, null, [], [undefined, undefined], ['child-node', undefined]])(
    'handles incomplete loopEndInput value (%j) without crashing',
    (rawValue) => {
      const parentNode = createParentNode();
      mocks.nodesMap.set(parentNode.nodeId, parentNode);

      const data = {
        nodeId: 'loop-end',
        parentNodeId: parentNode.nodeId,
        flowNodeType: FlowNodeTypeEnum.nestedEnd,
        name: 'End',
        inputs: [
          {
            key: NodeInputKeyEnum.nestedEndInput,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: rawValue as any
          }
        ],
        outputs: []
      } as FlowNodeItemType;

      expect(() => renderLoopEnd(data)).not.toThrow();
      expect(mocks.onChangeNode).not.toHaveBeenCalled();
    }
  );

  it.each([
    [FlowNodeTypeEnum.parallelRun, NodeOutputKeyEnum.parallelSuccessResults, undefined],
    [FlowNodeTypeEnum.loop, NodeOutputKeyEnum.nestedArrayResult, undefined],
    [
      FlowNodeTypeEnum.parallelRun,
      NodeOutputKeyEnum.parallelSuccessResults,
      ['deleted-node', 'out-1']
    ],
    [FlowNodeTypeEnum.loop, NodeOutputKeyEnum.nestedArrayResult, ['deleted-node', 'out-1']]
  ])(
    'resets %s parent output valueType back to arrayAny when reference is %j',
    (flowNodeType, outputKey, rawValue) => {
      const parentNode = createParentNode({
        flowNodeType,
        outputValueType: WorkflowIOValueTypeEnum.arrayString
      });
      mocks.nodesMap.set(parentNode.nodeId, parentNode);

      const data = {
        nodeId: 'loop-end',
        parentNodeId: parentNode.nodeId,
        flowNodeType: FlowNodeTypeEnum.nestedEnd,
        name: 'End',
        inputs: [
          {
            key: NodeInputKeyEnum.nestedEndInput,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: rawValue as any
          }
        ],
        outputs: []
      } as FlowNodeItemType;

      renderLoopEnd(data);

      expect(
        mocks.nodesMap.get(parentNode.nodeId)?.outputs.find((output) => output.key === outputKey)
          ?.valueType
      ).toBe(WorkflowIOValueTypeEnum.arrayAny);
    }
  );

  it.each([
    [WorkflowIOValueTypeEnum.string, WorkflowIOValueTypeEnum.arrayString],
    [WorkflowIOValueTypeEnum.number, WorkflowIOValueTypeEnum.arrayNumber],
    [WorkflowIOValueTypeEnum.boolean, WorkflowIOValueTypeEnum.arrayBoolean],
    [WorkflowIOValueTypeEnum.object, WorkflowIOValueTypeEnum.arrayObject],
    [WorkflowIOValueTypeEnum.any, WorkflowIOValueTypeEnum.arrayAny],
    [WorkflowIOValueTypeEnum.arrayString, WorkflowIOValueTypeEnum.arrayAny]
  ])(
    'maps referenced child output type %s to parent array output %s',
    (childValueType, expectedArrayType) => {
      const parentNode = createParentNode({
        outputValueType: WorkflowIOValueTypeEnum.arrayBoolean
      });
      mocks.nodesMap.set(parentNode.nodeId, parentNode);
      mocks.nodesMap.set('child-node', {
        nodeId: 'child-node',
        name: 'Child',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        inputs: [],
        outputs: [
          {
            id: 'out-1',
            key: 'out-1',
            label: 'Out',
            type: FlowNodeOutputTypeEnum.static,
            valueType: childValueType
          }
        ]
      } as FlowNodeItemType);

      const data = {
        nodeId: 'loop-end',
        parentNodeId: parentNode.nodeId,
        flowNodeType: FlowNodeTypeEnum.nestedEnd,
        name: 'End',
        inputs: [
          {
            key: NodeInputKeyEnum.nestedEndInput,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.any,
            label: '',
            value: ['child-node', 'out-1']
          }
        ],
        outputs: []
      } as FlowNodeItemType;

      renderLoopEnd(data);

      if (expectedArrayType === WorkflowIOValueTypeEnum.arrayBoolean) {
        expect(
          mocks.nodesMap
            .get(parentNode.nodeId)
            ?.outputs.find((output) => output.key === NodeOutputKeyEnum.parallelSuccessResults)
            ?.valueType
        ).toBe(WorkflowIOValueTypeEnum.arrayBoolean);
      } else {
        expect(
          mocks.nodesMap
            .get(parentNode.nodeId)
            ?.outputs.find((output) => output.key === NodeOutputKeyEnum.parallelSuccessResults)
            ?.valueType
        ).toBe(expectedArrayType);
      }
    }
  );

  it('infers output type when referencing a global variable', () => {
    const parentNode = createParentNode();
    mocks.nodesMap.set(parentNode.nodeId, parentNode);
    mocks.chatConfig = {
      variables: [
        {
          id: 'var-1',
          key: 'userScore',
          label: 'User Score',
          description: '',
          type: VariableInputEnum.numberInput,
          valueType: WorkflowIOValueTypeEnum.number
        }
      ]
    };

    const data = {
      nodeId: 'loop-end',
      parentNodeId: parentNode.nodeId,
      flowNodeType: FlowNodeTypeEnum.nestedEnd,
      name: 'End',
      inputs: [
        {
          key: NodeInputKeyEnum.nestedEndInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.any,
          label: '',
          value: [VARIABLE_NODE_ID, 'userScore']
        }
      ],
      outputs: []
    } as FlowNodeItemType;

    renderLoopEnd(data);

    expect(
      mocks.nodesMap
        .get(parentNode.nodeId)
        ?.outputs.find((output) => output.key === NodeOutputKeyEnum.parallelSuccessResults)
        ?.valueType
    ).toBe(WorkflowIOValueTypeEnum.arrayNumber);
  });
});
