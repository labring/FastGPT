import {
  WorkflowCheckIssueCodeEnum,
  WorkflowDiagnosticCodeEnum
} from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { createWorkflowCheckDocument } from '@/web/core/workflow/check/document';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

describe('createWorkflowCheckDocument', () => {
  const makeNodes = (): Node<FlowNodeItemType>[] =>
    ['start', 'target', 'other'].map(
      (id) =>
        ({
          id,
          position: { x: 0, y: 0 },
          data: {
            nodeId: id,
            name: id,
            flowNodeType:
              id === 'start' ? FlowNodeTypeEnum.workflowStart : FlowNodeTypeEnum.textEditor,
            inputs: [],
            outputs: []
          }
        }) as Node<FlowNodeItemType>
    );

  it('preserves invalid references and resource markers without serializing UI functions or mutating the graph', () => {
    const nodes = makeNodes();
    const condition = () => true;
    nodes[1].data.inputs.push({
      key: 'reference',
      label: 'Reference',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      value: ['deleted', 'output']
    });
    nodes[1].data.pluginData = { error: WorkflowCheckIssueCodeEnum.toolMissing };
    nodes[1].data.outputs.push({
      id: 'out',
      key: 'out',
      type: FlowNodeOutputTypeEnum.static,
      invalidCondition: condition
    });
    const before = JSON.stringify(nodes);
    const { document, diagnostics } = createWorkflowCheckDocument({ nodes, edges: [] });
    expect(diagnostics).toEqual([]);
    expect(document.nodes[1].inputs[0].value).toEqual(['deleted', 'output']);
    expect(document.nodes[1].pluginData?.error).toBe(WorkflowCheckIssueCodeEnum.toolMissing);
    expect(document.nodes[1].outputs[0]).not.toHaveProperty('invalidCondition');
    expect(JSON.stringify(nodes)).toBe(before);
    expect(nodes[1].data.outputs[0].invalidCondition).toBe(condition);
  });

  it('normalizes omitted handles and supports historical right target handles', () => {
    const { document, diagnostics } = createWorkflowCheckDocument({
      nodes: makeNodes(),
      edges: [
        { id: 'default', source: 'start', target: 'target' },
        {
          id: 'right',
          source: 'target',
          target: 'other',
          sourceHandle: 'target-source-right',
          targetHandle: 'other-target-right'
        }
      ]
    });
    expect(diagnostics).toEqual([]);
    expect(document.executionEdges).toEqual([
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'target' } },
      { source: { kind: 'next', nodeId: 'target' }, target: { kind: 'target', nodeId: 'other' } }
    ]);
  });

  it('keeps other edges when one handle or endpoint is invalid and preserves the failing edge in diagnostics', () => {
    const edges: Edge[] = [
      { id: 'invalid', source: 'start', target: 'target', sourceHandle: 'unknown' },
      { id: 'valid', source: 'start', target: 'other' },
      { id: 'missing', source: 'deleted', target: 'target' },
      {
        id: 'tool',
        source: 'start',
        target: 'target',
        sourceHandle: NodeOutputKeyEnum.selectedTools
      }
    ];
    const result = createWorkflowCheckDocument({ nodes: makeNodes(), edges });
    expect(result.document.executionEdges).toHaveLength(1);
    expect(result.diagnostics.map((issue) => issue.code)).toEqual([
      WorkflowDiagnosticCodeEnum.edgeHandleUnsupported,
      WorkflowDiagnosticCodeEnum.nodeNotFound,
      WorkflowDiagnosticCodeEnum.toolEdgeInvalid
    ]);
    expect(result.diagnostics[0].params?.edge).toMatchObject({
      source: 'start',
      target: 'target',
      sourceHandle: 'unknown'
    });
  });

  it('turns malformed handle errors into concrete diagnostics and continues projecting', () => {
    const { diagnostics, document } = createWorkflowCheckDocument({
      nodes: makeNodes(),
      edges: [
        {
          id: 'malformed',
          source: 'start',
          target: 'target',
          sourceHandle: 42 as unknown as string
        },
        { id: 'valid', source: 'start', target: 'other' }
      ]
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.edgeInvalid,
        params: expect.objectContaining({ reason: expect.stringContaining('startsWith') })
      })
    ]);
    expect(document.executionEdges).toHaveLength(1);
  });
});
