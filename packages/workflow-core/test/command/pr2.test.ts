import {
  FlowNodeInputTypeEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowCommandError,
  WorkflowIOValueTypeEnum,
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
  getAvailableInputReferences,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };
const apply = async (
  document: ReturnType<typeof createWorkflowDocument>,
  command: Parameters<typeof applyWorkflowCommand>[0]['command']
) => (await applyWorkflowCommand({ document, command, dependencies })).document;

const createLinearDocument = async () => {
  let document = createWorkflowDocument();
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'start',
    template: parseNodeTemplateRef('builtin:workflow-start')
  });
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'text',
    template: parseNodeTemplateRef('builtin:text-editor'),
    connectFrom: { kind: 'next', nodeId: 'start' }
  });
  document = await apply(document, {
    type: 'input.set',
    nodeId: 'text',
    inputKey: 'system_textareaInput',
    value: 'hello'
  });
  document = await apply(document, {
    type: 'node.add',
    nodeId: 'answer',
    template: parseNodeTemplateRef('builtin:assigned-answer'),
    connectFrom: { kind: 'next', nodeId: 'text' }
  });
  return apply(document, {
    type: 'input.ref',
    nodeId: 'answer',
    inputKey: 'text',
    ref: { nodeId: 'text', outputKey: 'system_text' }
  });
};

describe('PR2 workflow commands', () => {
  it('updates, moves, clones and removes nodes with graph side effects', async () => {
    const document = await createLinearDocument();
    document.nodes
      .find((node) => node.nodeId === 'text')!
      .inputs[0].renderTypeList.push(FlowNodeInputTypeEnum.password);
    const cloneResult = await applyWorkflowCommand({
      document,
      command: {
        type: 'node.clone',
        sourceNodeId: 'text',
        nodeId: 'text-copy',
        position: { x: 400, y: 100 }
      },
      dependencies
    });
    expect(cloneResult.document.nodes.find((node) => node.nodeId === 'text-copy')).toMatchObject({
      nodeId: 'text-copy',
      position: { x: 400, y: 100 }
    });
    expect(
      cloneResult.document.nodes.find((node) => node.nodeId === 'text-copy')!.inputs[0].value
    ).toBeUndefined();

    const updated = await applyWorkflowCommand({
      document: cloneResult.document,
      command: { type: 'node.update', nodeId: 'answer', name: 'Final answer' },
      dependencies
    });
    expect(updated.document.nodes.find((node) => node.nodeId === 'answer')?.name).toBe(
      'Final answer'
    );

    const removed = await applyWorkflowCommand({
      document: updated.document,
      command: { type: 'node.remove', nodeId: 'text' },
      dependencies
    });
    expect(removed.document.executionEdges).toHaveLength(0);
    expect(
      removed.document.nodes.find((node) => node.nodeId === 'answer')!.inputs[0].value
    ).toBeUndefined();
    expect(removed.changes[0].details).toMatchObject({ removedEdgeCount: 2 });
  });

  it('connects, disconnects and atomically reconnects normal edges', async () => {
    let document = await createLinearDocument();
    document = await apply(document, {
      type: 'edge.disconnect',
      edge: {
        source: { kind: 'next', nodeId: 'text' },
        target: { kind: 'target', nodeId: 'answer' }
      }
    });
    document = await apply(document, {
      type: 'edge.connect',
      edge: {
        source: { kind: 'next', nodeId: 'start' },
        target: { kind: 'target', nodeId: 'answer' }
      }
    });
    document = await apply(document, {
      type: 'edge.reconnect',
      oldEdge: {
        source: { kind: 'next', nodeId: 'start' },
        target: { kind: 'target', nodeId: 'answer' }
      },
      newEdge: {
        source: { kind: 'next', nodeId: 'text' },
        target: { kind: 'target', nodeId: 'answer' }
      }
    });
    expect(document.executionEdges).toHaveLength(2);
    await expect(
      applyWorkflowCommand({
        document,
        command: { type: 'edge.connect', edge: document.executionEdges[0] },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });

  it('manages ChatConfig and global variables and blocks referenced removal', async () => {
    let document = await createLinearDocument();
    document = await apply(document, {
      type: 'config.set',
      path: 'questionGuide.open',
      value: true
    });
    document = await apply(document, {
      type: 'variable.add',
      variable: {
        key: 'tenantId',
        label: 'Tenant ID',
        description: 'Current tenant',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }
    });
    document = await apply(document, {
      type: 'input.ref',
      nodeId: 'answer',
      inputKey: 'text',
      ref: { nodeId: VARIABLE_NODE_ID, outputKey: 'tenantId' }
    });
    expect(document.chatConfig.questionGuide?.open).toBe(true);
    expect(
      getAvailableInputReferences({ document, nodeId: 'answer', inputKey: 'text' })
    ).toContainEqual(
      expect.objectContaining({
        ref: { nodeId: VARIABLE_NODE_ID, outputKey: 'tenantId' },
        source: 'variable'
      })
    );
    document = await apply(document, {
      type: 'variable.update',
      key: 'tenantId',
      patch: { key: 'currentTenantId' }
    });
    expect(document.nodes.find((node) => node.nodeId === 'answer')!.inputs[0].value).toEqual([
      VARIABLE_NODE_ID,
      'currentTenantId'
    ]);
    await expect(
      applyWorkflowCommand({
        document,
        command: { type: 'variable.remove', key: 'currentTenantId' },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });

  it('validates common complex parameters and protects system-maintained inputs', async () => {
    let document = await createLinearDocument();
    document = await apply(document, {
      type: 'node.add',
      nodeId: 'http',
      template: parseNodeTemplateRef('builtin:http-request')
    });
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'http',
          inputKey: 'system_httpHeader',
          value: { key: 'x-token', value: 'secret' }
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
    document = await apply(document, {
      type: 'input.set',
      nodeId: 'http',
      inputKey: 'system_httpHeader',
      value: [{ key: 'x-token', value: 'secret' }]
    });
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'http',
          inputKey: 'addInputParam',
          value: []
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });
});
