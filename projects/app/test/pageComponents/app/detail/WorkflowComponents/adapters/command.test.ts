import {
  getRemovalNodeIdsWithCore,
  validateConnectionWithCore
} from '@/pageComponents/app/detail/WorkflowComponents/adapters/command';
import { validateWorkflowForWeb } from '@/pageComponents/app/detail/WorkflowComponents/adapters/validation';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { WorkflowCommandError } from '@fastgpt/workflow-core/domain/diagnostic';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import fixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';
import { describe, expect, it } from 'vitest';

const createGraph = () => {
  const workflow = compileStoreWorkflow(WorkflowDocumentSchema.parse(fixture));
  return {
    nodes: workflow.nodes.map((item) =>
      storeNode2FlowNode({ item, t: ((value: string) => value) as any })
    ),
    edges: workflow.edges.map((edge) =>
      storeEdge2RenderEdge({ edge: { ...edge, targetHandle: edge.target + '-target-right' } })
    )
  };
};

describe('Workflow Core command adapters', () => {
  it('allows editing and publishing a historical graph with right target handles', () => {
    const graph = createGraph();
    expect(getRemovalNodeIdsWithCore({ ...graph, nodeId: 'text' })).toEqual({
      status: 'success',
      data: ['text']
    });
    expect(
      validateConnectionWithCore({
        ...graph,
        edges: graph.edges.slice(1),
        connection: graph.edges[0]
      })
    ).toEqual({ status: 'success', data: undefined });
    expect(validateWorkflowForWeb(graph)).toMatchObject({
      source: 'shared',
      nodeIds: undefined
    });
  });

  it('allows Web fallback when an existing edge cannot be projected into Core', () => {
    const graph = createGraph();
    graph.edges[0].targetHandle = 'legacy-handle';
    expect(getRemovalNodeIdsWithCore({ ...graph, nodeId: 'text' }).status).toBe('adapter-error');
    expect(validateConnectionWithCore({ ...graph, connection: graph.edges[1] }).status).toBe(
      'adapter-error'
    );
  });

  it('still rejects an unsupported handle on the new connection', () => {
    const graph = createGraph();
    const result = validateConnectionWithCore({
      ...graph,
      connection: { ...graph.edges[0], targetHandle: 'invalid-new-handle' }
    });
    expect(result).toMatchObject({
      status: 'domain-error',
      diagnostics: [{ code: 'WORKFLOW_EDGE_HANDLE_UNSUPPORTED' }]
    });
    expect(getRemovalNodeIdsWithCore({ ...graph, nodeId: 'missing' }).status).toBe('domain-error');
  });
});

describe('validateWorkflowForWeb', () => {
  it('uses legacy validation when an existing edge cannot be projected', () => {
    const graph = createGraph();
    graph.edges[0].targetHandle = 'legacy-handle';

    expect(validateWorkflowForWeb(graph)).toMatchObject({
      source: 'legacy',
      nodeIds: undefined,
      adapterError: expect.any(WorkflowCommandError)
    });
  });

  it('still rejects missing required inputs after falling back to legacy validation', () => {
    const graph = createGraph();
    graph.edges[0].targetHandle = 'legacy-handle';
    graph.nodes.find((node) => node.data.nodeId === 'text')!.data.inputs[0].value = '';

    expect(validateWorkflowForWeb(graph)).toMatchObject({
      source: 'legacy',
      nodeIds: ['text']
    });
  });

  it('still rejects domain errors after the graph has been projected', () => {
    const graph = createGraph();
    graph.edges.push({ ...graph.edges[0], id: 'duplicate-edge' });

    expect(validateWorkflowForWeb(graph)).toMatchObject({
      source: 'shared',
      nodeIds: expect.arrayContaining(['start', 'text']),
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'WORKFLOW_EDGE_DUPLICATED', severity: 'error' })
      ])
    });
  });
});
