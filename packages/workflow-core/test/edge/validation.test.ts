import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { applyWorkflowCommand } from '../../src/command/apply';
import {
  assertExecutionConnection,
  assertExecutionEdge,
  getDefaultExecutionSourcePort
} from '../../src/edge/validation';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import { createWorkflowDocument } from '../../src/domain/document';
import { builtinTemplateProvider } from '../template/provider';
import fixture from '../fixtures/basic-static/workflow.json';
import { describe, expect, it } from 'vitest';

describe('assertExecutionConnection', () => {
  it('checks the same connection as the write command without modifying the document', async () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const edge = document.executionEdges.shift()!;
    const before = structuredClone(document);
    expect(assertExecutionConnection({ document, edge })).toBeUndefined();
    expect(document).toEqual(before);
    const result = await applyWorkflowCommand({
      document,
      command: { type: 'edge.connect', edge },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(result.document.executionEdges.at(-1)).toEqual(edge);
    expect(document).toEqual(before);
  });

  it('rejects duplicate and self connections without modifying the document', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const before = structuredClone(document);
    expect(() => assertExecutionConnection({ document, edge: document.executionEdges[0] })).toThrow(
      'WORKFLOW_EDGE_DUPLICATED'
    );
    expect(() =>
      assertExecutionConnection({
        document,
        edge: {
          source: { kind: 'next', nodeId: 'text' },
          target: { kind: 'target', nodeId: 'text' }
        }
      })
    ).toThrow(WorkflowCommandError);
    expect(document).toEqual(before);
  });
});

describe('assertExecutionEdge', () => {
  const templates = [...moduleTemplatesFlat, CommentNode];
  /** 从真实模板投影持久化节点，覆盖手写节点容易遗漏的能力差异。 */
  const createNode = (template: (typeof templates)[number], nodeId: string) =>
    StoreNodeItemTypeSchema.parse({ ...template, nodeId });
  const answer = templates.find(
    (template) => template.flowNodeType === FlowNodeTypeEnum.answerNode
  )!;
  const caller = templates.find((template) => template.flowNodeType === FlowNodeTypeEnum.toolCall)!;

  it('allows exactly the ordinary source and target ports exposed by existing templates', () => {
    for (const template of templates) {
      for (const direction of ['source', 'target'] as const) {
        const document = createWorkflowDocument({
          nodes:
            direction === 'source'
              ? [createNode(template, 'source'), createNode(answer, 'target')]
              : [createNode(caller, 'source'), createNode(template, 'target')]
        });
        const connect = () =>
          assertExecutionEdge(document, {
            source: { kind: 'next', nodeId: 'source' },
            target: { kind: 'target', nodeId: 'target' }
          });
        const enabled =
          direction === 'source' ? template.showSourceHandle : template.showTargetHandle;
        const message = `${template.flowNodeType} ${direction}`;
        if (enabled) expect(connect, message).not.toThrow();
        else
          expect(connect, message).toThrow(
            direction === 'source'
              ? 'WORKFLOW_NEXT_PORT_UNSUPPORTED'
              : 'WORKFLOW_TARGET_PORT_UNSUPPORTED'
          );
      }
    }
  });

  it('matches every template tool capability without a separately maintained node list', () => {
    for (const template of templates) {
      const document = createWorkflowDocument({
        nodes: [createNode(caller, 'caller'), createNode(template, 'tool')]
      });
      const connect = () =>
        assertExecutionEdge(document, {
          source: { kind: 'selectedTools', nodeId: 'caller' },
          target: { kind: 'selectedTools', nodeId: 'tool' }
        });
      if (template.isTool) expect(connect, template.flowNodeType).not.toThrow();
      else expect(connect, template.flowNodeType).toThrow('WORKFLOW_TOOL_EDGE_NODE_INVALID');
    }
  });

  it('rejects editor-only node types without a runtime template', () => {
    const document = createWorkflowDocument({
      nodes: [
        createNode(caller, 'caller'),
        createNode({ ...answer, flowNodeType: FlowNodeTypeEnum.globalVariable }, 'config')
      ]
    });
    expect(() =>
      assertExecutionEdge(document, {
        source: { kind: 'selectedTools', nodeId: 'caller' },
        target: { kind: 'selectedTools', nodeId: 'config' }
      })
    ).toThrow('WORKFLOW_TOOL_EDGE_NODE_INVALID');
  });

  it('retains enabled catch and container-scope guards', () => {
    const document = createWorkflowDocument({
      nodes: [createNode(caller, 'caller'), createNode(answer, 'target')]
    });
    const catchEdge = {
      source: { kind: 'catch' as const, nodeId: 'caller' },
      target: { kind: 'target' as const, nodeId: 'target' }
    };
    expect(() => assertExecutionEdge(document, catchEdge)).toThrow('WORKFLOW_CATCH_NOT_ENABLED');
    document.nodes[0].catchError = true;
    expect(() => assertExecutionEdge(document, catchEdge)).not.toThrow();
    const toolEdge = {
      source: { kind: 'selectedTools' as const, nodeId: 'caller' },
      target: { kind: 'selectedTools' as const, nodeId: 'target' }
    };
    document.nodes[1].flowNodeType = FlowNodeTypeEnum.code;
    document.nodes[1].parentNodeId = 'container';
    expect(() => assertExecutionEdge(document, toolEdge)).toThrow('WORKFLOW_EDGE_CROSS_SCOPE');
  });
});

describe('getDefaultExecutionSourcePort', () => {
  it('supports inserting a reply before subsequent processing', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    expect(getDefaultExecutionSourcePort(document, 'answer')).toEqual({
      kind: 'next',
      nodeId: 'answer'
    });
  });
});
