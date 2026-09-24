import { reactFlowStateToWorkflowDocument } from '@/pageComponents/app/detail/WorkflowComponents/adapters/document';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import {
  WorkflowDocumentSchema,
  compileStoreWorkflow,
  type WorkflowDocument
} from '@fastgpt/workflow-core';
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
