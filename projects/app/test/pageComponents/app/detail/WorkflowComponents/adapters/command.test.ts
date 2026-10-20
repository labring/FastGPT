import {
  getRemovalNodeIdsWithCore,
  validateConnectionWithCore
} from '@/pageComponents/app/detail/WorkflowComponents/adapters/command';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/check/check';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import fixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
  it('allows an existing text node to be mounted and published as a tool', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    document.nodes.push(
      StoreNodeItemTypeSchema.parse({
        ...ToolCallNode,
        nodeId: 'caller',
        inputs: ToolCallNode.inputs.map((input) => {
          if (input.key === NodeInputKeyEnum.aiModelId) return { ...input, value: 'test-model' };
          if (input.key === NodeInputKeyEnum.userChatInput)
            return {
              ...input,
              value: ['start', NodeInputKeyEnum.userChatInput],
              selectedType: FlowNodeInputTypeEnum.reference
            };
          return input;
        })
      })
    );
    document.executionEdges = [
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'caller' } },
      {
        source: { kind: 'selectedTools', nodeId: 'caller' },
        target: { kind: 'selectedTools', nodeId: 'text' }
      },
      document.executionEdges[1]
    ];
    const workflow = compileStoreWorkflow(document);
    const graph = {
      nodes: workflow.nodes.map((item) =>
        storeNode2FlowNode({ item, t: ((key: string) => key) as any })
      ),
      edges: workflow.edges.map((edge) => storeEdge2RenderEdge({ edge }))
    };
    expect(
      validateConnectionWithCore({
        ...graph,
        edges: graph.edges.filter((_, index) => index !== 1),
        connection: graph.edges[1]
      })
    ).toEqual({ status: 'success', data: undefined });
    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({ hasError: false });
  });

  it('allows a reply before later processing through connection and publish checks', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const answer = document.nodes.find((node) => node.nodeId === 'answer')!;
    answer.inputs[0].value = 'Processing your request';
    answer.inputs[0].selectedType = FlowNodeInputTypeEnum.textarea;
    document.executionEdges = [
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'answer' } },
      { source: { kind: 'next', nodeId: 'answer' }, target: { kind: 'target', nodeId: 'text' } }
    ];
    const workflow = compileStoreWorkflow(document);
    const graph = {
      nodes: workflow.nodes.map((item) =>
        storeNode2FlowNode({ item, t: ((key: string) => key) as any })
      ),
      edges: workflow.edges.map((edge) => storeEdge2RenderEdge({ edge }))
    };
    expect(
      validateConnectionWithCore({
        ...graph,
        edges: graph.edges.slice(0, 1),
        connection: graph.edges[1]
      })
    ).toEqual({ status: 'success', data: undefined });
    expect(checkWorkflowBeforeRunOrPublish(graph)).toMatchObject({ hasError: false });
  });

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
  it('does not treat editor-only comment fields as runtime inputs', () => {
    const graph = createGraph();
    const comment = storeNode2FlowNode({
      item: {
        ...CommentNode,
        nodeId: 'comment',
        inputs: CommentNode.inputs.map((input) =>
          input.key === NodeInputKeyEnum.commentText ? { ...input, value: 'A canvas note' } : input
        )
      },
      t: ((key: string) => key) as any
    });
    expect(
      checkWorkflowBeforeRunOrPublish({
        ...graph,
        nodes: [...graph.nodes, comment]
      })
    ).toMatchObject({ hasError: false });
  });

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
