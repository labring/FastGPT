import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import { IfElseNode } from '@fastgpt/global/core/workflow/template/system/ifElse';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';
import { createWorkflowDocument } from '../../src/domain/document';
import { parseNodeTemplateRef } from '../../src/template/type';
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
  it('removes only explicitly deleted branch ports while preserving edges with other diagnostics', async () => {
    const branch = StoreNodeItemTypeSchema.parse({ ...IfElseNode, nodeId: 'branch' });
    const input = branch.inputs.find((item) => item.key === NodeInputKeyEnum.ifElseList)!;
    const keep = { branchId: 'keep', condition: 'AND', list: [{}] };
    input.value = [keep, { ...keep, branchId: 'remove' }];
    const document = createWorkflowDocument({
      nodes: [
        branch,
        StoreNodeItemTypeSchema.parse({
          ...AiChatModule,
          nodeId: 'target',
          parentNodeId: 'different-scope'
        })
      ]
    });
    document.executionEdges = ['keep', 'remove', 'historical-missing'].map((branchKey) => ({
      source: { kind: 'branch', nodeId: 'branch', branchKey },
      target: { kind: 'target', nodeId: 'target' }
    }));
    const before = structuredClone(document);
    const result = await applyWorkflowCommand({
      document,
      command: {
        type: 'input.set',
        nodeId: 'branch',
        inputKey: NodeInputKeyEnum.ifElseList,
        value: [keep]
      },
      dependencies
    });
    expect(result.document.executionEdges.map((edge) => edge.source)).toEqual([
      document.executionEdges[0].source,
      document.executionEdges[2].source
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.branchEdgesRemoved,
        params: { removedEdgeCount: 1 }
      })
    );
    expect(document).toEqual(before);
  });

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
