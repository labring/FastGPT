import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import {
  getNodeHandleRenderMode,
  getNodeShellHandleAnchor,
  getNodeShellHandleModel,
  type NodeShellHandleData
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/utils/nodeHandle';

const createNode = (patch: Partial<NodeShellHandleData> = {}): NodeShellHandleData => ({
  nodeId: 'node-1',
  flowNodeType: FlowNodeTypeEnum.emptyNode,
  inputs: [],
  outputs: [],
  ...patch
});

describe('workflow shell handle topology', () => {
  it('anchors measured shell handles to the card right edge', () => {
    expect(
      getNodeShellHandleAnchor({
        isFolded: false,
        cardWidth: 320,
        center: { x: 286, y: 84 }
      })
    ).toEqual({ left: 320, top: 84 });
    expect(
      getNodeShellHandleAnchor({
        isFolded: true,
        cardWidth: 320,
        center: { x: 286, y: 84 }
      })
    ).toBeUndefined();
  });

  it('keeps shell handles while a folded node is being measured', () => {
    expect(
      getNodeHandleRenderMode({
        isFolded: true,
        renderFull: true
      })
    ).toEqual({
      renderShellHandles: true,
      renderFullHandles: false
    });
  });

  it('keeps expanded node handles at their original positions after measurement', () => {
    expect(
      getNodeHandleRenderMode({
        isFolded: false,
        renderFull: true
      })
    ).toEqual({
      renderShellHandles: false,
      renderFullHandles: true
    });
  });

  it('keeps offscreen shell handles while the full node is not mounted', () => {
    expect(
      getNodeHandleRenderMode({
        isFolded: false,
        renderFull: false
      })
    ).toEqual({
      renderShellHandles: true,
      renderFullHandles: false
    });
  });

  it('keeps branch handle ids identical to the full if/else node', () => {
    const model = getNodeShellHandleModel(
      createNode({
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        inputs: [
          {
            key: NodeInputKeyEnum.ifElseList,
            value: [
              {
                branchId: 'branch-a',
                condition: 'AND',
                list: []
              }
            ]
          }
        ]
      })
    );

    expect(model.replacesDefaultSource).toBe(true);
    expect(model.sourceHandles.map((handle) => handle.handleId)).toEqual([
      'node-1-source-branch-a',
      'node-1-source-ELSE'
    ]);
  });

  it('keeps option, source output and catch handles', () => {
    const model = getNodeShellHandleModel(
      createNode({
        flowNodeType: FlowNodeTypeEnum.userSelect,
        catchError: true,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            value: [{ key: 'option-a' }, { key: 'option-b' }]
          }
        ],
        outputs: [
          {
            key: 'custom-output',
            type: FlowNodeOutputTypeEnum.source,
            label: 'Custom output'
          }
        ]
      })
    );

    expect(model.sourceHandles.map((handle) => handle.handleId)).toEqual([
      'node-1-source-option-a',
      'node-1-source-option-b',
      'node-1-source-custom-output',
      'node-1-source_catch-right'
    ]);
  });

  it('keeps one stable reference handle for dynamic user selection', () => {
    const model = getNodeShellHandleModel(
      createNode({
        flowNodeType: FlowNodeTypeEnum.userSelect,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            value: ['node-1', 'options']
          }
        ]
      })
    );

    expect(model.sourceHandles.map((handle) => handle.handleId)).toEqual([
      `node-1-source-${USER_SELECT_REFERENCE_HANDLE_KEY}`
    ]);
  });

  it('anchors every shell source handle at the card right edge', () => {
    const model = getNodeShellHandleModel(
      createNode({
        flowNodeType: FlowNodeTypeEnum.ifElseNode,
        inputs: [
          {
            key: NodeInputKeyEnum.ifElseList,
            value: [{ branchId: 'branch-a' }, { branchId: 'branch-b' }]
          }
        ]
      })
    );

    expect(model.sourceHandles.map((handle) => handle.translate)).toEqual([
      [9, 0],
      [9, 0],
      [9, 0]
    ]);
    expect(model.sourceHandles.some((handle) => 'topPercent' in handle)).toBe(false);
  });

  it('measures the catch handle with ordinary source handles only when enabled', () => {
    const enabled = getNodeShellHandleModel(createNode({ catchError: true }));
    const disabled = getNodeShellHandleModel(createNode({ catchError: false }));

    expect(enabled.sourceHandles.map((handle) => handle.handleId)).toEqual([
      'node-1-source_catch-right'
    ]);
    expect(disabled.sourceHandles).toEqual([]);
  });

  it('does not add a default source handle without the template flag', () => {
    expect(getNodeShellHandleModel(createNode()).sourceHandles).toEqual([]);
  });
});
