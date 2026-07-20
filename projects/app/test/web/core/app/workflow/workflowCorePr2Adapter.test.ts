import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/workflowCheck';
import { validateWorkflowForWeb } from '@/pageComponents/app/detail/WorkflowComponents/adapters/validation';
import {
  WorkflowDocumentSchema,
  compileStoreWorkflow,
  type WorkflowDocument
} from '@fastgpt/workflow-core';
import staticWorkflowFixture from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';
import commonLinearWorkflowFixture from '@fastgpt/workflow-core/test/fixtures/common-linear/workflow.json';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { describe, expect, it, vi } from 'vitest';

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

describe('PR2 Web Validation Adapter', () => {
  const fixture = WorkflowDocumentSchema.parse(staticWorkflowFixture);
  const commonLinearFixture = WorkflowDocumentSchema.parse(commonLinearWorkflowFixture);

  it.each([
    ['basic-static', fixture],
    ['common-linear', commonLinearFixture]
  ])('routes %s workflows to the shared validator', (_name, document) => {
    const graph = toWebGraph(document);
    const legacyNodeIds = validateWorkflowWithWebRules(graph);
    const result = validateWorkflowForWeb({ ...graph, chatConfig: document.chatConfig });
    expect(result.source).toBe('shared');
    expect(result.nodeIds).toEqual(legacyNodeIds);
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps required-input failures equivalent to the legacy validator', () => {
    const document = structuredClone(fixture);
    document.nodes
      .find((node) => node.nodeId === 'text')!
      .inputs.find((input) => input.key === 'system_textareaInput')!.value = undefined;
    const graph = toWebGraph(document);
    const legacyNodeIds = validateWorkflowWithWebRules(graph);
    const result = validateWorkflowForWeb({ ...graph, chatConfig: document.chatConfig });
    expect(result.source).toBe('shared');
    expect(result.nodeIds).toEqual(legacyNodeIds);
    expect(result.diagnostics?.map((item) => item.code)).toContain(
      'WORKFLOW_REQUIRED_INPUT_MISSING'
    );
  });

  it('keeps malformed linear handles inside shared diagnostics', () => {
    const graph = toWebGraph(fixture);
    graph.edges[0].sourceHandle = 'unknown-handle';
    const result = validateWorkflowForWeb({ ...graph, chatConfig: fixture.chatConfig });
    expect(result.source).toBe('shared');
    expect(result.nodeIds).toEqual(expect.arrayContaining(['start', 'text', 'answer']));
    expect(result.diagnostics?.[0]?.code).toBe('WORKFLOW_EDGE_HANDLE_UNSUPPORTED');
  });

  it('falls back to legacy validation for unsupported Web node types', () => {
    const graph = toWebGraph(fixture);
    graph.nodes[0].data.flowNodeType = FlowNodeTypeEnum.agent;

    expect(validateWorkflowForWeb({ ...graph, chatConfig: fixture.chatConfig }).source).toBe(
      'legacy'
    );
  });

  it('falls back to legacy validation when Document conversion fails', () => {
    const graph = toWebGraph(fixture);
    const nodeWithInput = graph.nodes.find((node) => node.data.inputs.length > 0)!;
    nodeWithInput.data.inputs[0].value = () => undefined;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = validateWorkflowForWeb({ ...graph, chatConfig: fixture.chatConfig });
      expect(result.source).toBe('legacy');
      expect(result.adapterError).toBeInstanceOf(Error);
    } finally {
      consoleError.mockRestore();
    }
  });
});
