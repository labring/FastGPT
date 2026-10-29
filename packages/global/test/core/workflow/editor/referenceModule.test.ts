import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/core/workflow/editor/runtime/runtime';

describe('workflow reference reachability', () => {
  it('allows loop custom outputs to reference child nodes only', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.loopCustomOutputs,
              label: 'Custom outputs',
              renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
              valueType: WorkflowIOValueTypeEnum.dynamic,
              value: []
            },
            {
              key: 'childOutput',
              label: 'Child output',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              canEdit: true,
              value: ['child', 'output']
            },
            {
              key: NodeInputKeyEnum.loopRunInputArray,
              label: 'Loop input',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.arrayAny,
              value: ['child', 'output']
            },
            {
              key: NodeInputKeyEnum.childrenNodeIdList,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: ['child']
            }
          ],
          outputs: []
        },
        {
          nodeId: 'child',
          parentNodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Child',
          inputs: [],
          outputs: [
            {
              id: 'output',
              key: 'output',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        }
      ],
      edges: [],
      chatConfig: {}
    });

    expect(
      editor.getReferenceOptions({
        nodeId: 'loop',
        valueType: WorkflowIOValueTypeEnum.any,
        includeChildren: true
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ reference: ['child', 'output'] })])
    );
    expect(editor.getField({ nodeId: 'loop', fieldKey: 'childOutput' })?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(
      editor.getField({ nodeId: 'loop', fieldKey: NodeInputKeyEnum.loopRunInputArray })?.references
    ).toEqual([expect.objectContaining({ code: 'unreachable_reference' })]);
  });
});
