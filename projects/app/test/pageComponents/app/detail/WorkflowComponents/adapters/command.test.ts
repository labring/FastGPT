import {
  getRemovalNodeIdsWithCore,
  validateConnectionWithCore
} from '@/pageComponents/app/detail/WorkflowComponents/adapters/command';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/check/check';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
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
    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: false,
      errorNodeIds: []
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

describe('shared Web workflow checks', () => {
  it('reports an unsupported historical edge through the shared diagnostic pipeline', () => {
    const graph = createGraph();
    graph.edges[0].targetHandle = 'legacy-handle';

    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'WORKFLOW_EDGE_HANDLE_UNSUPPORTED' })
      ])
    });
  });

  it('continues checking required inputs after an edge projection error', () => {
    const graph = createGraph();
    graph.edges[0].targetHandle = 'legacy-handle';
    graph.nodes.find((node) => node.data.nodeId === 'text')!.data.inputs[0].value = '';

    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: true,
      issueMap: {
        text: expect.arrayContaining([expect.objectContaining({ code: 'required_input_empty' })])
      }
    });
  });

  it('still rejects domain errors after the graph has been projected', () => {
    const graph = createGraph();
    graph.edges.push({ ...graph.edges[0], id: 'duplicate-edge' });

    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({
      hasError: true,
      errorNodeIds: expect.arrayContaining(['start', 'text']),
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'WORKFLOW_EDGE_DUPLICATED', severity: 'error' })
      ])
    });
  });
});
