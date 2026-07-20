import { checkWorkflowNodeAndConnection } from '@/web/core/workflow/utils';
import {
  WorkflowDocumentSchema,
  compileStoreWorkflow,
  type WorkflowDocument,
  validateWorkflow
} from '@fastgpt/workflow-core/src/index';
import aiWorkflowFixture from '@fastgpt/workflow-core/test/fixtures/basic-ai/workflow.json';
import staticWorkflowFixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node } from 'reactflow';
import { describe, expect, it } from 'vitest';

const toWebGraph = (document: WorkflowDocument) => {
  const workflow = compileStoreWorkflow(document);
  return {
    nodes: workflow.nodes.map<Node<FlowNodeItemType>>((node) => ({
      id: node.nodeId,
      type: node.flowNodeType,
      data: node,
      position: node.position ?? { x: 0, y: 0 }
    })),
    edges: workflow.edges.map<Edge>((edge, index) => ({
      id: `edge-${index}`,
      ...edge
    }))
  };
};

const getCoreErrorNodeIds = (document: WorkflowDocument) =>
  validateWorkflow(document)
    .filter((diagnostic) => diagnostic.severity === 'error' && diagnostic.nodeId)
    .map((diagnostic) => diagnostic.nodeId as string);

const getWebErrorNodeIds = (document: WorkflowDocument) =>
  checkWorkflowNodeAndConnection(toWebGraph(document)) ?? [];

describe('PR1 Workflow Core validation characterization', () => {
  const aiWorkflow = WorkflowDocumentSchema.parse(aiWorkflowFixture);
  const staticWorkflow = WorkflowDocumentSchema.parse(staticWorkflowFixture);

  it.each([
    ['basic-ai', aiWorkflow],
    ['basic-static', staticWorkflow]
  ])('keeps valid %s accepted by both validators', (_name, workflow) => {
    expect(getWebErrorNodeIds(structuredClone(workflow))).toEqual([]);
    expect(getCoreErrorNodeIds(structuredClone(workflow))).toEqual([]);
  });

  it.each([
    [
      'required input',
      (document: WorkflowDocument) => {
        const textInput = document.nodes
          .find((node) => node.nodeId === 'text')!
          .inputs.find((input) => input.key === 'system_textareaInput')!;
        textInput.value = undefined;
      },
      'text'
    ],
    [
      'unreachable node',
      (document: WorkflowDocument) => {
        document.executionEdges = document.executionEdges.filter(
          (edge) => edge.target.nodeId !== 'answer'
        );
      },
      'answer'
    ]
  ] as const)('reports the same node for %s', (_name, mutate, expectedNodeId) => {
    const document = structuredClone(staticWorkflow);
    mutate(document);
    expect(getWebErrorNodeIds(structuredClone(document))).toContain(expectedNodeId);
    expect(getCoreErrorNodeIds(structuredClone(document))).toContain(expectedNodeId);
  });

  it('reports the same node for an invalid string reference', () => {
    const document = structuredClone(aiWorkflow);
    const userInput = document.nodes
      .find((node) => node.nodeId === 'ai')!
      .inputs.find((input) => input.key === 'userChatInput')!;
    userInput.value = ['missing', 'output'];
    expect(getWebErrorNodeIds(structuredClone(document))).toContain('ai');
    expect(getCoreErrorNodeIds(structuredClone(document))).toContain('ai');
  });
});
