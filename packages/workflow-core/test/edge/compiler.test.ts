import {
  WorkflowDocumentSchema,
  WorkflowCommandError,
  compileExecutionEdge,
  createWorkflowDocument,
  decompileStoreEdge
} from '../../src';
import aiWorkflow from '../fixtures/basic-ai/workflow.json';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { describe, expect, it } from 'vitest';

const document = createWorkflowDocument(aiWorkflow as Parameters<typeof createWorkflowDocument>[0]);

describe('compileExecutionEdge', () => {
  it('compiles and decompiles a normal edge', () => {
    const edge = document.executionEdges[0];
    const stored = compileExecutionEdge(edge, document);
    expect(stored).toEqual({
      source: 'start',
      sourceHandle: 'start-source-right',
      target: 'ai',
      targetHandle: 'ai-target-left'
    });
    expect(decompileStoreEdge(stored, document)).toEqual(edge);
  });

  it('rejects missing nodes and unsupported handles', () => {
    expect(() =>
      compileExecutionEdge(
        { source: { kind: 'next', nodeId: 'missing' }, target: { kind: 'target', nodeId: 'ai' } },
        document
      )
    ).toThrow(WorkflowCommandError);
    expect(() =>
      decompileStoreEdge(
        { source: 'start', sourceHandle: 'legacy', target: 'ai', targetHandle: 'ai-target-left' },
        document
      )
    ).toThrow(WorkflowCommandError);
    expect(() =>
      decompileStoreEdge(
        {
          source: 'start',
          sourceHandle: 'start-source-right',
          target: 'ai',
          targetHandle: 'legacy'
        },
        document
      )
    ).toThrow(WorkflowCommandError);
    expect(() =>
      decompileStoreEdge(
        {
          source: 'start',
          sourceHandle: 'start-source-unknown',
          target: 'ai',
          targetHandle: 'ai-target-left'
        },
        document
      )
    ).toThrow(WorkflowCommandError);
  });

  it('maps catch, branch, source output and tool handles', () => {
    const expanded = WorkflowDocumentSchema.parse({
      ...document,
      nodes: document.nodes.map((node) =>
        node.nodeId === 'start'
          ? {
              ...node,
              outputs: [
                ...node.outputs,
                { id: 'execute', key: 'execute', type: 'source', valueType: 'string' }
              ]
            }
          : node
      )
    });
    const branchDocument = WorkflowDocumentSchema.parse({
      ...expanded,
      nodes: expanded.nodes.map((node) =>
        node.nodeId === 'start' ? { ...node, flowNodeType: FlowNodeTypeEnum.ifElseNode } : node
      )
    });
    const cases = [
      {
        semantic: {
          source: { kind: 'catch' as const, nodeId: 'start' },
          target: { kind: 'target' as const, nodeId: 'ai' }
        },
        sourceHandle: 'start-source_catch-right',
        targetHandle: 'ai-target-left'
      },
      {
        semantic: {
          source: { kind: 'branch' as const, nodeId: 'start', branchKey: 'yes' },
          target: { kind: 'target' as const, nodeId: 'ai' }
        },
        sourceHandle: 'start-source-yes',
        targetHandle: 'ai-target-left',
        document: branchDocument
      },
      {
        semantic: {
          source: { kind: 'sourceOutput' as const, nodeId: 'start', outputKey: 'execute' },
          target: { kind: 'target' as const, nodeId: 'ai' }
        },
        sourceHandle: 'start-source-execute',
        targetHandle: 'ai-target-left'
      },
      {
        semantic: {
          source: { kind: 'selectedTools' as const, nodeId: 'start' },
          target: { kind: 'selectedTools' as const, nodeId: 'ai' }
        },
        sourceHandle: 'selectedTools',
        targetHandle: 'selectedTools'
      }
    ];

    for (const item of cases) {
      const caseDocument = item.document ?? expanded;
      const stored = compileExecutionEdge(item.semantic, caseDocument);
      expect(stored).toMatchObject({
        sourceHandle: item.sourceHandle,
        targetHandle: item.targetHandle
      });
      expect(decompileStoreEdge(stored, caseDocument)).toEqual(item.semantic);
    }
  });

  it('rejects branch ports on non-branch nodes and mismatched tool handles', () => {
    expect(() =>
      compileExecutionEdge(
        {
          source: { kind: 'branch', nodeId: 'start', branchKey: 'yes' },
          target: { kind: 'target', nodeId: 'ai' }
        },
        document
      )
    ).toThrow(WorkflowCommandError);
    expect(() =>
      decompileStoreEdge(
        {
          source: 'start',
          sourceHandle: 'selectedTools',
          target: 'ai',
          targetHandle: 'ai-target-left'
        },
        document
      )
    ).toThrow(WorkflowCommandError);
  });

  it('rejects a semantic source output that is not executable', () => {
    expect(() =>
      compileExecutionEdge(
        {
          source: { kind: 'sourceOutput', nodeId: 'start', outputKey: 'userChatInput' },
          target: { kind: 'target', nodeId: 'ai' }
        },
        document
      )
    ).toThrow(WorkflowCommandError);
  });
});
