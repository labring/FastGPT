import { describe, expect, it } from 'vitest';
import { calculateParentNodeSizeAndPosition } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowComputeContext';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { Node } from '@xyflow/react';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

describe('calculateParentNodeSizeAndPosition', () => {
  const createLoopNode = (overrides?: Partial<Node<FlowNodeItemType>>): Node<FlowNodeItemType> => ({
    id: 'loop-parent',
    position: { x: 100, y: 100 },
    measured: { width: 900, height: 500 },
    data: {
      nodeId: 'loop-parent',
      flowNodeType: FlowNodeTypeEnum.loop,
      name: 'Loop Node',
      avatar: '',
      inputs: [
        {
          key: NodeInputKeyEnum.nodeWidth,
          renderTypeList: [],
          valueType: WorkflowIOValueTypeEnum.number,
          label: '',
          value: 900
        },
        {
          key: NodeInputKeyEnum.nodeHeight,
          renderTypeList: [],
          valueType: WorkflowIOValueTypeEnum.number,
          label: '',
          value: 500
        },
        {
          key: NodeInputKeyEnum.nestedNodeInputHeight,
          renderTypeList: [],
          valueType: WorkflowIOValueTypeEnum.number,
          label: '',
          value: 83
        }
      ],
      outputs: []
    },
    ...overrides
  });

  it('should return undefined when parent node does not exist or has no children', () => {
    const loopNode = createLoopNode();
    expect(
      calculateParentNodeSizeAndPosition({ nodes: [loopNode], parentId: 'loop-parent' })
    ).toBeUndefined();
    expect(
      calculateParentNodeSizeAndPosition({ nodes: [], parentId: 'loop-parent' })
    ).toBeUndefined();
  });

  it('should calculate size and position for children even if unmeasured (fallback to initial/default)', () => {
    const loopNode = createLoopNode();
    const startNode: Node<FlowNodeItemType> = {
      id: 'loop-start',
      position: { x: 160, y: 380 },
      initialWidth: 260,
      initialHeight: 160,
      data: {
        nodeId: 'loop-start',
        parentNodeId: 'loop-parent',
        flowNodeType: FlowNodeTypeEnum.loopStart,
        name: 'Loop Start',
        avatar: '',
        inputs: [],
        outputs: []
      }
    };

    const res = calculateParentNodeSizeAndPosition({
      nodes: [loopNode, startNode],
      parentId: 'loop-parent'
    });

    expect(res).toBeDefined();
    expect(res?.parentX).toBe(160 - 70); // 90
    expect(res?.parentY).toBe(380 - 83 - 240); // 57
    expect(res?.childWidth).toBe(260 + 80); // 340
    expect(res?.childHeight).toBe(160 + 80); // 240
  });

  it('should adaptively expand childWidth and childHeight when large node is added or dragged', () => {
    const loopNode = createLoopNode();
    const startNode: Node<FlowNodeItemType> = {
      id: 'loop-start',
      position: { x: 160, y: 380 },
      measured: { width: 250, height: 150 },
      data: {
        nodeId: 'loop-start',
        parentNodeId: 'loop-parent',
        flowNodeType: FlowNodeTypeEnum.loopStart,
        name: 'Loop Start',
        avatar: '',
        inputs: [],
        outputs: []
      }
    };
    // Code running node placed to the right and down
    const codeNode: Node<FlowNodeItemType> = {
      id: 'custom-code',
      position: { x: 530, y: 380 },
      measured: { width: 540, height: 750 },
      data: {
        nodeId: 'custom-code',
        parentNodeId: 'loop-parent',
        flowNodeType: FlowNodeTypeEnum.customCode,
        name: 'Code Run',
        avatar: '',
        inputs: [],
        outputs: []
      }
    };

    const res = calculateParentNodeSizeAndPosition({
      nodes: [loopNode, startNode, codeNode],
      parentId: 'loop-parent'
    });

    expect(res).toBeDefined();
    // minX = 160, maxX = 530 + 540 = 1070 -> childWidth = 1070 - 160 + 80 = 990
    expect(res?.childWidth).toBe(990);
    // minY = 380, maxY = 380 + 750 = 1130 -> childHeight = 1130 - 380 + 80 = 830
    expect(res?.childHeight).toBe(830);
    expect(res?.parentX).toBe(90);
    expect(res?.parentY).toBe(57);
  });
});
