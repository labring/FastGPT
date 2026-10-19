import { reactFlowStateToWorkflowDocument } from '@/pageComponents/app/detail/WorkflowComponents/adapters/document';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import {
  WorkflowDocumentSchema,
  type WorkflowDocument
} from '@fastgpt/global/core/workflow/type/document';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import {
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import basicAiWorkflowFixture from '@fastgpt/workflow-core/test/fixtures/basic-ai/workflow.json';
import { describe, expect, it } from 'vitest';

const toWebGraph = (document: WorkflowDocument) => {
  const workflow = compileStoreWorkflow(document);
  return {
    nodes: workflow.nodes.map((node) =>
      storeNode2FlowNode({ item: node, t: ((value: string) => value) as any })
    ),
    edges: workflow.edges.map((edge) => storeEdge2RenderEdge({ edge }))
  };
};

describe('reactFlowStateToWorkflowDocument', () => {
  it.each([
    { value: [VARIABLE_NODE_ID, 'customer'], expected: [VARIABLE_NODE_ID, 'customer'] },
    {
      value: [
        [VARIABLE_NODE_ID, 'customer'],
        ['start', 'userChatInput']
      ],
      expected: [
        [VARIABLE_NODE_ID, 'customer'],
        ['start', 'userChatInput']
      ]
    },
    { value: ['start', 'userChatInput'], expected: ['start', 'userChatInput'] },
    { value: [VARIABLE_NODE_ID, 'deleted'], expected: undefined }
  ])('preserves live references and filters deleted variables: $value', ({ value, expected }) => {
    const sourceDocument = WorkflowDocumentSchema.parse(basicAiWorkflowFixture);
    sourceDocument.chatConfig.variables = [
      {
        key: 'customer',
        label: 'Customer',
        description: '',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];
    const graph = toWebGraph(sourceDocument);
    const input = graph.nodes
      .find((node) => node.id === 'ai')!
      .data.inputs.find((input) => input.key === 'fileUrlList')!;
    input.value = value;
    input.selectedType = FlowNodeInputTypeEnum.reference;

    const document = reactFlowStateToWorkflowDocument({
      ...graph,
      chatConfig: sourceDocument.chatConfig
    });

    expect(
      document.nodes
        .find((node) => node.nodeId === 'ai')!
        .inputs.find((input) => input.key === 'fileUrlList')?.value
    ).toEqual(expected);
    expect(document.chatConfig.variables).toEqual(sourceDocument.chatConfig.variables);
    expect(input.value).toEqual(value);
  });

  it('removes Web template functions before creating WorkflowDocument', () => {
    const sourceDocument = WorkflowDocumentSchema.parse(basicAiWorkflowFixture);
    const graph = toWebGraph(sourceDocument);
    const aiNode = graph.nodes.find((node) => node.data.nodeId === 'ai')!;
    const reasoningOutput = aiNode.data.outputs.find((output) => output.key === 'reasoningText')!;
    expect(reasoningOutput.invalidCondition).toBeTypeOf('function');

    aiNode.data.isFolded = true;
    const document = reactFlowStateToWorkflowDocument({
      ...graph,
      chatConfig: sourceDocument.chatConfig
    });
    const storedAiNode = document.nodes.find((node) => node.nodeId === 'ai')!;

    expect(storedAiNode.isFolded).toBe(true);
    expect(storedAiNode.outputs.some((output) => 'invalidCondition' in output)).toBe(false);
    expect(() => structuredClone(document)).not.toThrow();
    expect(() => JSON.stringify(document)).not.toThrow();
    expect(compileStoreWorkflow(document).nodes.map((node) => node.nodeId)).toEqual(
      expect.arrayContaining(['start', 'ai'])
    );
  });
});
