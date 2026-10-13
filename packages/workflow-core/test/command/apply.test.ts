import {
  WorkflowCommandError,
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

const createStartedDocument = async () =>
  (
    await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      },
      dependencies
    })
  ).document;

describe('applyWorkflowCommand', () => {
  it('adds and connects a node without mutating the input document', async () => {
    const document = await createStartedDocument();
    const before = structuredClone(document);
    const result = await applyWorkflowCommand({
      document,
      command: {
        type: 'node.add',
        nodeId: 'ai',
        template: parseNodeTemplateRef('builtin:ai-chat'),
        connectFrom: { kind: 'next', nodeId: 'start' },
        inputOverrides: { systemPrompt: 'Be concise' }
      },
      dependencies
    });

    expect(document).toEqual(before);
    expect(result.document.nodes).toHaveLength(2);
    expect(result.document.executionEdges).toEqual([
      {
        source: { kind: 'next', nodeId: 'start' },
        target: { kind: 'target', nodeId: 'ai' }
      }
    ]);
    expect(result.changes).toEqual([{ type: 'node.add', nodeId: 'ai' }]);
  });

  it('applies explicit empty, false and zero overrides after template and Start defaults', async () => {
    const result = await applyWorkflowCommand({
      document: await createStartedDocument(),
      command: {
        type: 'node.add',
        nodeId: 'ai',
        template: parseNodeTemplateRef('builtin:ai-chat'),
        inputOverrides: {
          userChatInput: '',
          isResponseAnswerText: false,
          maxToken: 0,
          fileUrlList: []
        }
      },
      dependencies
    });
    const ai = result.document.nodes.find((node) => node.nodeId === 'ai')!;
    expect(ai.inputs.find((input) => input.key === 'userChatInput')?.value).toBe('');
    expect(ai.inputs.find((input) => input.key === 'isResponseAnswerText')?.value).toBe(false);
    expect(ai.inputs.find((input) => input.key === 'maxToken')?.value).toBe(0);
    expect(ai.inputs.find((input) => input.key === 'fileUrlList')?.value).toEqual([]);
  });

  it('sets literal and reference inputs through the same dispatcher', async () => {
    const document = (
      await applyWorkflowCommand({
        document: await createStartedDocument(),
        command: {
          type: 'node.add',
          nodeId: 'answer',
          template: parseNodeTemplateRef('builtin:assigned-answer'),
          connectFrom: { kind: 'next', nodeId: 'start' }
        },
        dependencies
      })
    ).document;
    const literal = await applyWorkflowCommand({
      document,
      command: { type: 'input.set', nodeId: 'answer', inputKey: 'text', value: 'done' },
      dependencies
    });
    expect(literal.document.nodes[1].inputs[0].value).toBe('done');

    const reference = await applyWorkflowCommand({
      document: literal.document,
      command: {
        type: 'input.ref',
        nodeId: 'answer',
        inputKey: 'text',
        ref: { nodeId: 'start', outputKey: 'userChatInput' }
      },
      dependencies
    });
    expect(reference.document.nodes[1].inputs[0].value).toEqual(['start', 'userChatInput']);
  });

  it('does not expose a partial document when a command fails', async () => {
    const document = await createStartedDocument();
    const before = structuredClone(document);
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'ai',
          template: parseNodeTemplateRef('builtin:ai-chat'),
          inputOverrides: { missing: true }
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
    expect(document).toEqual(before);
  });

  it('rejects an invalid connectFrom before returning the new node', async () => {
    const document = await createStartedDocument();
    const before = structuredClone(document);
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'ai',
          template: parseNodeTemplateRef('builtin:ai-chat'),
          connectFrom: { kind: 'next', nodeId: 'missing' }
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
    expect(document).toEqual(before);
  });
});
