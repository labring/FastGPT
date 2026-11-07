import { reactFlowStateToWorkflowDocument } from '@/pageComponents/app/detail/WorkflowComponents/adapters/document';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import {
  WorkflowDocumentSchema,
  type WorkflowDocument
} from '@fastgpt/global/core/workflow/type/document';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import { applyWorkflowCommand } from '@fastgpt/workflow-core/command/apply';
import { createWorkflowDocument } from '@fastgpt/workflow-core/domain/document';
import { builtinTemplateProvider } from '@fastgpt/workflow-core/test/template/provider';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import {
  NodeInputKeyEnum,
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
  it('keeps generated HTTP nodes free of deprecated fields while retaining existing custom inputs', async () => {
    const legacyInput = {
      key: 'legacy-token',
      label: 'Legacy token',
      renderTypeList: [FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      canEdit: true,
      value: 'saved-value'
    };
    const result = await applyWorkflowCommand({
      document: createWorkflowDocument({
        nodes: [
          {
            ...HttpNode468,
            nodeId: 'legacy-http',
            inputs: [...HttpNode468.inputs, legacyInput]
          }
        ]
      }),
      command: {
        type: 'node.add',
        nodeId: 'generated-http',
        template: { kind: 'builtin', templateId: 'http-request' },
        inputOverrides: { [NodeInputKeyEnum.httpReqUrl]: 'https://example.com/hook' }
      },
      dependencies: { templateProvider: builtinTemplateProvider, locale: 'en' }
    });
    const graph = toWebGraph(result.document);
    expect(
      graph.nodes
        .find((node) => node.id === 'generated-http')!
        .data.inputs.some((input) => input.key === NodeInputKeyEnum.addInputParam)
    ).toBe(false);

    const document = reactFlowStateToWorkflowDocument({ ...graph, chatConfig: {} });
    const workflow = compileStoreWorkflow(document);
    expect(workflow.nodes.find((node) => node.nodeId === 'legacy-http')?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.addInputParam }),
        expect.objectContaining({
          ...legacyInput,
          renderTypeList: expect.arrayContaining(legacyInput.renderTypeList)
        })
      ])
    );
    const generatedInputs = workflow.nodes.find((node) => node.nodeId === 'generated-http')!.inputs;
    expect(generatedInputs.some((input) => input.key === NodeInputKeyEnum.addInputParam)).toBe(
      false
    );
    expect(generatedInputs.find((input) => input.key === NodeInputKeyEnum.httpReqUrl)?.value).toBe(
      'https://example.com/hook'
    );
  });

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
