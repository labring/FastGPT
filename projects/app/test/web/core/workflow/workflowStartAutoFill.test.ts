import { describe, it, expect } from 'vitest';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import type { Node, Edge } from 'reactflow';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  EDGE_TYPE
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  applyWorkflowStartInputAutoFill,
  collectWorkflowStartInputAutoFillPatches,
  collectWorkflowStartOutputAutoFillRevertPatches
} from '@/web/core/workflow/workflowStartAutoFill';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/output';

const startNode: Node<FlowNodeItemType> = {
  id: 'start',
  type: FlowNodeTypeEnum.workflowStart,
  position: { x: 0, y: 0 },
  data: {
    id: 'start',
    nodeId: 'start',
    flowNodeType: FlowNodeTypeEnum.workflowStart,
    name: 'Workflow start',
    inputs: [],
    outputs: [
      {
        id: NodeOutputKeyEnum.userChatInput,
        key: NodeOutputKeyEnum.userChatInput,
        label: 'User question',
        type: FlowNodeInputTypeEnum.input,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ]
  }
};

const startNodeWithFiles: Node<FlowNodeItemType> = {
  ...startNode,
  data: {
    ...startNode.data,
    outputs: [...startNode.data.outputs, userFilesInput]
  }
};

const makeFreshNode = (nodeId: string, template: FlowNodeTemplateType): Node<FlowNodeItemType> => ({
  id: nodeId,
  type: template.flowNodeType,
  position: { x: 100, y: 100 },
  data: {
    id: nodeId,
    nodeId,
    flowNodeType: template.flowNodeType,
    name: template.name,
    inputs: template.inputs.map((input) => ({
      ...input,
      value: input.value ?? input.defaultValue
    })),
    outputs: template.outputs
  }
});

describe('workflowStartAutoFill', () => {
  it.each([
    [
      'AI Chat',
      AiChatModule,
      NodeInputKeyEnum.userChatInput,
      ['start', NodeOutputKeyEnum.userChatInput]
    ],
    [
      'Dataset Search',
      DatasetSearchModule,
      NodeInputKeyEnum.datasetSearchInput,
      [['start', NodeOutputKeyEnum.userChatInput]]
    ],
    [
      'Classify',
      ClassifyQuestionModule,
      NodeInputKeyEnum.userChatInput,
      ['start', NodeOutputKeyEnum.userChatInput]
    ],
    [
      'Tool Call',
      ToolCallNode,
      NodeInputKeyEnum.userChatInput,
      ['start', NodeOutputKeyEnum.userChatInput]
    ]
  ] as const)(
    'auto-fills userChatInput reference on connecting %s node',
    (_name, template, inputKey, expectedValue) => {
      const targetNode = makeFreshNode('target', template);
      targetNode.data.inputs = applyWorkflowStartInputAutoFill({
        inputs: targetNode.data.inputs,
        workflowStartNodeId: startNode.data.nodeId,
        workflowStartOutputs: startNode.data.outputs
      });

      expect(targetNode.data.inputs.find((input) => input.key === inputKey)?.value).toEqual(
        expectedValue
      );
    }
  );

  it('auto-fills fileUrlList and userChatInput when connected to startNode with files', () => {
    const targetNode = makeFreshNode('ai-chat', AiChatModule);
    const patches = collectWorkflowStartInputAutoFillPatches({
      nodes: [startNodeWithFiles, targetNode],
      edges: [{ source: 'start', target: 'ai-chat' }],
      workflowStartNode: startNodeWithFiles.data
    });

    const keys = patches.map((p) => p.key).sort();
    expect(keys).toEqual([NodeInputKeyEnum.fileUrlList, NodeInputKeyEnum.userChatInput].sort());

    targetNode.data.inputs = applyWorkflowStartInputAutoFill({
      inputs: targetNode.data.inputs,
      workflowStartNodeId: startNodeWithFiles.data.nodeId,
      workflowStartOutputs: startNodeWithFiles.data.outputs
    });
    expect(
      targetNode.data.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList)?.value
    ).toEqual([['start', NodeOutputKeyEnum.userFiles]]);
  });

  it('auto-fills indirect downstream nodes reachable from workflow start', () => {
    const aiNode = makeFreshNode('ai-chat', AiChatModule);
    const toolNode = makeFreshNode('tool-call', ToolCallNode);
    const patches = collectWorkflowStartInputAutoFillPatches({
      nodes: [startNode, aiNode, toolNode],
      edges: [
        { source: 'start', target: 'ai-chat' },
        { source: 'ai-chat', target: 'tool-call' }
      ],
      workflowStartNode: startNode.data
    });

    const toolPatch = patches.find(
      (p) => p.nodeId === 'tool-call' && p.key === NodeInputKeyEnum.userChatInput
    );
    expect(toolPatch?.value.value).toEqual(['start', NodeOutputKeyEnum.userChatInput]);
  });

  it('does not overwrite manually configured input references', () => {
    const targetNode = makeFreshNode('ai-chat', AiChatModule);
    const manualRef = [VARIABLE_NODE_ID, 'customVar'];
    targetNode.data.inputs = targetNode.data.inputs.map((input) =>
      input.key === NodeInputKeyEnum.userChatInput ? { ...input, value: manualRef } : input
    );

    targetNode.data.inputs = applyWorkflowStartInputAutoFill({
      inputs: targetNode.data.inputs,
      workflowStartNodeId: startNode.data.nodeId,
      workflowStartOutputs: startNode.data.outputs
    });

    expect(
      targetNode.data.inputs.find((i) => i.key === NodeInputKeyEnum.userChatInput)?.value
    ).toEqual(manualRef);
  });

  it('reverts auto-filled references when start connection or outputs are removed', () => {
    const aiNode = makeFreshNode('ai-chat', AiChatModule);
    const edges: Edge[] = [{ id: 'e1', source: 'start', target: 'ai-chat', type: EDGE_TYPE }];
    const nodes = [startNodeWithFiles, aiNode];

    // 1. Auto-fill
    const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
      nodes,
      edges,
      workflowStartNode: startNodeWithFiles.data
    });
    aiNode.data.inputs = aiNode.data.inputs.map((input) => {
      const patch = autoFillPatches.find((p) => p.key === input.key);
      return patch ? patch.value : input;
    });
    expect(
      aiNode.data.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList)?.value
    ).toBeDefined();

    // 2. Revert files when file output removed
    const revertPatches = collectWorkflowStartOutputAutoFillRevertPatches({
      nodes,
      edges,
      workflowStartNode: startNodeWithFiles.data,
      outputKey: userFilesInput.key
    });
    expect(revertPatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'ai-chat', key: NodeInputKeyEnum.fileUrlList })
      ])
    );
  });
});
