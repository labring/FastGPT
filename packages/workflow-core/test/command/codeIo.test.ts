import {
  FlowNodeOutputTypeEnum,
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

describe('code node IO synchronization', () => {
  it('uses main parameters and return keys as the editable IO source of truth', async () => {
    let document = createWorkflowDocument();
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'code',
          template: parseNodeTemplateRef('builtin:code')
        },
        dependencies
      })
    ).document;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'answer',
          template: parseNodeTemplateRef('builtin:assigned-answer'),
          connectFrom: { kind: 'next', nodeId: 'code' }
        },
        dependencies
      })
    ).document;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.ref',
          nodeId: 'answer',
          inputKey: 'text',
          ref: { nodeId: 'code', outputKey: 'result' }
        },
        dependencies
      })
    ).document;

    const result = await applyWorkflowCommand({
      document,
      command: {
        type: 'input.set',
        nodeId: 'code',
        inputKey: 'code',
        value: `
          /**
           * @param {number} amount - Amount
           * @property {number} total - Total
           * @property {object} detail - Detail
           */
          function main({ amount }) {
            return { total: amount * 2, detail: { amount } };
          }
        `
      },
      dependencies
    });

    const codeNode = result.document.nodes.find((node) => node.nodeId === 'code')!;
    expect(codeNode.inputs.map((input) => input.key)).not.toEqual(
      expect.arrayContaining(['data1', 'data2'])
    );
    expect(codeNode.inputs).toContainEqual(
      expect.objectContaining({ key: 'amount', valueType: 'number', canEdit: true })
    );
    expect(
      codeNode.outputs
        .filter(
          (output) =>
            output.type === FlowNodeOutputTypeEnum.dynamic && output.key !== 'system_addOutputParam'
        )
        .map((output) => ({ key: output.key, valueType: output.valueType }))
    ).toEqual([
      { key: 'total', valueType: 'number' },
      { key: 'detail', valueType: 'object' }
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'WORKFLOW_OUTPUT_REFERENCES_REMAIN',
        params: expect.objectContaining({ outputKey: 'result' })
      })
    );
  });

  it('keeps existing IO when the code shape cannot be identified safely', async () => {
    let document = createWorkflowDocument();
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'code',
          template: parseNodeTemplateRef('builtin:code')
        },
        dependencies
      })
    ).document;
    const previousNode = structuredClone(document.nodes.find((node) => node.nodeId === 'code'));

    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'code',
          inputKey: 'code',
          value: 'function main(args) { return getResult(args); }'
        },
        dependencies
      })
    ).document;

    const nextNode = document.nodes.find((node) => node.nodeId === 'code')!;
    expect(nextNode.inputs.filter((input) => input.canEdit)).toEqual(
      previousNode?.inputs.filter((input) => input.canEdit)
    );
    expect(nextNode.outputs).toEqual(previousNode?.outputs);
  });

  it('removes all editable IO for an explicitly empty signature and return object', async () => {
    let document = createWorkflowDocument();
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'node.add',
          nodeId: 'code',
          template: parseNodeTemplateRef('builtin:code')
        },
        dependencies
      })
    ).document;

    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'code',
          inputKey: 'code',
          value: 'function main() { return {}; }'
        },
        dependencies
      })
    ).document;

    const codeNode = document.nodes.find((node) => node.nodeId === 'code')!;
    expect(codeNode.inputs.filter((input) => input.canEdit)).toHaveLength(0);
    expect(
      codeNode.outputs.filter(
        (output) =>
          output.type === FlowNodeOutputTypeEnum.dynamic && output.key !== 'system_addOutputParam'
      )
    ).toHaveLength(0);
  });
});
