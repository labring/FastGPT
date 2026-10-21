import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { applyWorkflowCommand } from '../../src/command/apply';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import { planNodeRemoval } from '../../src/node/removal';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { builtinTemplateProvider } from '../template/provider';
import fixture from '../fixtures/basic-static/workflow.json';
import { describe, expect, it } from 'vitest';

describe('planNodeRemoval', () => {
  it('protects every system node that the Web template forbids deleting', () => {
    for (const template of moduleTemplatesFlat.filter((template) => template.forbidDelete)) {
      const document = WorkflowDocumentSchema.parse({
        schemaVersion: 'fastgpt-workflow/v1',
        app: {},
        chatConfig: {},
        nodes: [{ ...template, nodeId: 'system' }],
        executionEdges: []
      });
      expect(() => planNodeRemoval({ document, nodeId: 'system' }), template.flowNodeType).toThrow(
        WorkflowDiagnosticCodeEnum.nodeDeleteForbidden
      );
    }
  });

  it('preserves descendant order and agrees with deletion without mutating the input', async () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const text = document.nodes.find((node) => node.nodeId === 'text')!;
    document.nodes.push(
      { ...structuredClone(text), nodeId: 'grandchild', parentNodeId: 'child' },
      { ...structuredClone(text), nodeId: 'child', parentNodeId: 'text' }
    );
    const before = structuredClone(document);
    const plan = planNodeRemoval({ document, nodeId: 'text' });
    expect(plan.deletedNodeIds).toEqual(['text', 'child', 'grandchild']);
    expect(document).toEqual(before);

    const result = await applyWorkflowCommand({
      document,
      command: { type: 'node.remove', nodeId: 'text' },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(result.changes[0].details?.deletedNodeIds).toEqual(plan.deletedNodeIds);
    expect(result.document.nodes.map((node) => node.nodeId)).toEqual(['answer', 'start']);
    expect(document).toEqual(before);
  });

  it.each(['start', 'missing'])(
    'rejects protected or missing node %s without mutation',
    (nodeId) => {
      const document = WorkflowDocumentSchema.parse(fixture);
      const before = structuredClone(document);
      expect(() => planNodeRemoval({ document, nodeId })).toThrow(WorkflowCommandError);
      expect(document).toEqual(before);
    }
  );

  it('preserves the last conditional loop break protection', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const text = document.nodes.find((node) => node.nodeId === 'text')!;
    text.flowNodeType = FlowNodeTypeEnum.loopRun;
    text.inputs[0].key = NodeInputKeyEnum.loopRunMode;
    text.inputs[0].value = 'conditional';
    document.nodes.push({
      ...structuredClone(text),
      nodeId: 'break',
      parentNodeId: 'text',
      flowNodeType: FlowNodeTypeEnum.loopRunBreak
    });
    const before = structuredClone(document);
    expect(() => planNodeRemoval({ document, nodeId: 'break' })).toThrow(
      WorkflowDiagnosticCodeEnum.conditionalLoopBreakRequired
    );
    expect(document).toEqual(before);
    document.nodes.push({ ...structuredClone(document.nodes.at(-1)!), nodeId: 'another-break' });
    expect(planNodeRemoval({ document, nodeId: 'break' }).deletedNodeIds).toEqual(['break']);
  });
});
