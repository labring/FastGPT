import {
  FlowNodeInputTypeEnum,
  WorkflowCommandError,
  WorkflowIOValueTypeEnum,
  applyWorkflowCommand,
  builtinTemplateProvider,
  compileStoreWorkflow,
  createWorkflowDocument,
  decompileStoreWorkflow,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

const addNode = async ({
  document,
  nodeId,
  template,
  after
}: {
  document: ReturnType<typeof createWorkflowDocument>;
  nodeId: string;
  template: string;
  after?: string;
}) =>
  (
    await applyWorkflowCommand({
      document,
      command: {
        type: 'node.add',
        nodeId,
        template: parseNodeTemplateRef(template),
        connectFrom: after ? { kind: 'next', nodeId: after } : undefined
      },
      dependencies
    })
  ).document;

describe('additional builtin nodes', () => {
  it('configures dataset concat through generic dynamic input commands', async () => {
    let document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'start',
      template: 'builtin:workflow-start'
    });
    document = await addNode({
      document,
      nodeId: 'search',
      template: 'builtin:dataset-search',
      after: 'start'
    });
    document = await addNode({
      document,
      nodeId: 'concat',
      template: 'builtin:dataset-concat',
      after: 'search'
    });
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.add',
          nodeId: 'concat',
          input: {
            key: 'quote_1',
            label: 'Quote 1',
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            required: true,
            canEdit: true
          }
        },
        dependencies
      })
    ).document;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.ref',
          nodeId: 'concat',
          inputKey: 'quote_1',
          ref: { nodeId: 'search', outputKey: 'quoteQA' }
        },
        dependencies
      })
    ).document;

    expect(document.nodes.find((node) => node.nodeId === 'concat')?.inputs).toContainEqual(
      expect.objectContaining({
        key: 'quote_1',
        value: ['search', 'quoteQA'],
        canEdit: true
      })
    );
    const storeWorkflow = compileStoreWorkflow(document);
    expect(compileStoreWorkflow(decompileStoreWorkflow({ workflow: storeWorkflow }))).toEqual(
      storeWorkflow
    );

    const removed = await applyWorkflowCommand({
      document,
      command: { type: 'input.remove', nodeId: 'concat', inputKey: 'quote_1' },
      dependencies
    });
    expect(
      removed.document.nodes
        .find((node) => node.nodeId === 'concat')
        ?.inputs.some((input) => input.key === 'quote_1')
    ).toBe(false);
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'input.remove',
          nodeId: 'concat',
          inputKey: 'system_datasetQuoteList'
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });

  it('creates and configures custom feedback through the standard input command', async () => {
    let document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'start',
      template: 'builtin:workflow-start'
    });
    document = await addNode({
      document,
      nodeId: 'feedback',
      template: 'builtin:custom-feedback',
      after: 'start'
    });
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'feedback',
          inputKey: 'system_textareaInput',
          value: 'Accurate answer'
        },
        dependencies
      })
    ).document;
    expect(document.nodes.find((node) => node.nodeId === 'feedback')).toMatchObject({
      flowNodeType: 'customFeedback',
      inputs: [expect.objectContaining({ value: 'Accurate answer' })]
    });
  });

  it('rejects dynamic inputs on nodes without a dynamic input marker', async () => {
    let document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'start',
      template: 'builtin:workflow-start'
    });
    document = await addNode({
      document,
      nodeId: 'feedback',
      template: 'builtin:custom-feedback',
      after: 'start'
    });
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'input.add',
          nodeId: 'feedback',
          input: {
            key: 'extra',
            label: 'Extra',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.input],
            canEdit: true
          }
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });
});
