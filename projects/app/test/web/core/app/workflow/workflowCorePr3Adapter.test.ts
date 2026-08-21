import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/workflowCheck';
import { validateWorkflowForWeb } from '@/pageComponents/app/detail/WorkflowComponents/adapters/validation';
import {
  getRemovalNodeIdsWithCore,
  validateConnectionWithCore
} from '@/pageComponents/app/detail/WorkflowComponents/adapters/command';
import { compileStoreWorkflow, type WorkflowDocument } from '@fastgpt/workflow-core';
import {
  createBranchingFixture,
  createDynamicIoCatchFixture,
  createNestedLoopFixture,
  createToolCallToolsFixture
} from '@fastgpt/workflow-core/test/fixtures/pr3';
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

const validateWorkflowWithWebRules = (graph: ReturnType<typeof toWebGraph>) => {
  const { errorNodeIds } = checkWorkflowBeforeRunOrPublish(graph);
  return errorNodeIds.length > 0 ? errorNodeIds : undefined;
};

describe('PR3 Web shared workflow adapters', () => {
  it.each([
    ['branching', createBranchingFixture],
    ['tool-call-tools', createToolCallToolsFixture],
    ['nested-loop', createNestedLoopFixture],
    ['dynamic-io-catch', createDynamicIoCatchFixture]
  ])('keeps %s validation on the shared path', async (_name, factory) => {
    const document = await factory();
    const graph = toWebGraph(document);
    const result = validateWorkflowForWeb({ ...graph, chatConfig: document.chatConfig });
    expect(result.source).toBe('shared');
    expect(result.diagnostics).toEqual([]);
    expect(result.nodeIds).toEqual(validateWorkflowWithWebRules(graph));
  });

  it('checks branch connections with the same Core edge rules', async () => {
    const document = await createBranchingFixture();
    const graph = toWebGraph(document);
    const result = validateConnectionWithCore({
      ...graph,
      connection: {
        source: 'route',
        sourceHandle: 'route-source-missing',
        target: 'yes',
        targetHandle: 'yes-target-left'
      }
    });
    expect(result.status).toBe('domain-error');
    if (result.status === 'domain-error') {
      expect(result.diagnostics.map((item) => item.code)).toContain(
        'WORKFLOW_BRANCH_KEY_NOT_FOUND'
      );
    }
  });

  it('accepts valid connections after real Web node initialization', async () => {
    const document = await createBranchingFixture();
    const graph = toWebGraph(document);
    const edge = graph.edges.find((edge) => edge.source === 'route' && edge.target === 'yes')!;

    const result = validateConnectionWithCore({
      nodes: graph.nodes,
      edges: graph.edges.filter((item) => item.id !== edge.id),
      connection: edge
    });

    expect(result.status).toBe('success');
  });

  it('returns recursive container removal IDs for ReactFlow changes', async () => {
    const document = await createNestedLoopFixture();
    const graph = toWebGraph(document);
    const result = getRemovalNodeIdsWithCore({ ...graph, nodeId: 'loop' });
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toEqual(expect.arrayContaining(['loop', 'loop__start', 'break']));
    }
  });

  it('separates Web adapter failures from Core domain diagnostics', async () => {
    const document = await createBranchingFixture();
    const graph = toWebGraph(document);
    const nodeWithInput = graph.nodes.find((node) => node.data.inputs.length > 0)!;
    nodeWithInput.data.inputs[0].value = () => undefined;

    const result = validateConnectionWithCore({
      ...graph,
      connection: {
        source: 'route',
        sourceHandle: 'route-source-yes',
        target: 'yes',
        targetHandle: 'yes-target-left'
      }
    });

    expect(result.status).toBe('adapter-error');
  });
});
