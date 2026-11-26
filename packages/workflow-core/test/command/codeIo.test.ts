import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';
import { createWorkflowDocument } from '../../src/domain/document';
import { parseNodeTemplateRef } from '../../src/template/type';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

describe('code node IO synchronization', () => {
  /** 为各个代码形状场景创建独立文档，保留命令分发器的真实初始化行为。 */
  const createCodeDocument = async () =>
    (
      await applyWorkflowCommand({
        document: createWorkflowDocument(),
        command: {
          type: 'node.add',
          nodeId: 'code',
          template: parseNodeTemplateRef('builtin:code')
        },
        dependencies
      })
    ).document;

  it('uses main parameters and return keys as the editable IO source of truth', async () => {
    let document = await createCodeDocument();
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
        code: WorkflowDiagnosticCodeEnum.outputReferencesRemain,
        params: expect.objectContaining({ outputKey: 'result' })
      })
    );
  });

  it('keeps existing IO when the code shape cannot be identified safely', async () => {
    let document = await createCodeDocument();
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

  it('keeps the existing output returned by a decorated Python entrypoint', async () => {
    const document = await createCodeDocument();
    const previous = document.nodes
      .find((node) => node.nodeId === 'code')
      ?.outputs.find((output) => output.key === 'result');
    expect(previous).toBeDefined();
    const result = await applyWorkflowCommand({
      document,
      command: {
        type: 'input.set',
        nodeId: 'code',
        inputKey: 'code',
        value: `def decorate(fn):
    def wrapper():
        return {"result": 1}
    return wrapper

@decorate
def main():
    return {}`
      },
      dependencies
    });

    expect(result.document.nodes.find((node) => node.nodeId === 'code')?.outputs).toContainEqual(
      previous
    );
  });

  it('removes all editable IO for an explicitly empty signature and return object', async () => {
    let document = await createCodeDocument();

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

  const setInput = ({
    document,
    inputKey,
    value
  }: {
    document: Awaited<ReturnType<typeof createCodeDocument>>;
    inputKey: string;
    value: string;
  }) =>
    applyWorkflowCommand({
      document,
      command: { type: 'input.set', nodeId: 'code', inputKey, value },
      dependencies
    });

  const getEditableInputs = (document: Awaited<ReturnType<typeof createCodeDocument>>) =>
    document.nodes
      .find((node) => node.nodeId === 'code')!
      .inputs.filter((input) => input.canEdit === true)
      .map((input) => input.key);

  const getDynamicOutputs = (document: Awaited<ReturnType<typeof createCodeDocument>>) =>
    document.nodes
      .find((node) => node.nodeId === 'code')!
      .outputs.filter(
        (output) =>
          output.type === FlowNodeOutputTypeEnum.dynamic && output.key !== 'system_addOutputParam'
      )
      .map((output) => ({ key: output.key, valueType: output.valueType }));

  it('keeps Python outputs and downstream references after floor division in either write order', async () => {
    let document = await createCodeDocument();
    document = (
      await setInput({
        document,
        inputKey: 'code',
        value: `
          /**
           * @property {number} quotient - Quotient
           * @property {number} remainder - Remainder
           */
          function main({ total, count }) {
            // keep existing JS comment
            return { quotient: Math.floor(total / count), remainder: total % count };
          }
        `
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
          ref: { nodeId: 'code', outputKey: 'remainder' }
        },
        dependencies
      })
    ).document;

    const pythonCode = [
      'def main(total, count=10 // 2, unit="s"):',
      '    return {',
      '        "quotient": total // count,',
      '        "remainder": total % count',
      '    }'
    ].join('\n');
    const expectedOutputs = [
      { key: 'quotient', valueType: WorkflowIOValueTypeEnum.number },
      { key: 'remainder', valueType: WorkflowIOValueTypeEnum.number }
    ];

    const langFirst = await setInput({ document, inputKey: 'codeType', value: 'py' });
    expect(langFirst.warnings).toEqual([]);
    const langFirstDone = await setInput({
      document: langFirst.document,
      inputKey: 'code',
      value: pythonCode
    });
    expect(langFirstDone.warnings).toEqual([]);
    expect(getEditableInputs(langFirstDone.document)).toEqual(['total', 'count', 'unit']);
    expect(getDynamicOutputs(langFirstDone.document)).toEqual(expectedOutputs);

    const codeFirst = await setInput({ document, inputKey: 'code', value: pythonCode });
    expect(codeFirst.warnings).toEqual([]);
    const codeFirstDone = await setInput({
      document: codeFirst.document,
      inputKey: 'codeType',
      value: 'py'
    });
    expect(codeFirstDone.warnings).toEqual([]);
    expect(getEditableInputs(codeFirstDone.document)).toEqual(['total', 'count', 'unit']);
    expect(getDynamicOutputs(codeFirstDone.document)).toEqual(expectedOutputs);
  });

  it('syncs new outputs identically in either write order for Python alias and JS arrow entrypoints', async () => {
    let document = await createCodeDocument();
    document = (
      await setInput({
        document,
        inputKey: 'code',
        value: `
          /**
           * @property {number} summary - Summary
           */
          function main({ data1 }) {
            return { summary: data1 };
          }
        `
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

    const pythonAlias = [
      'def calculate(data1, count):',
      '    return {',
      '        "summary": data1 // count,',
      '        "remainder": data1 % count',
      '    }',
      'main = calculate'
    ].join('\n');

    for (const order of ['langFirst', 'codeFirst'] as const) {
      const first =
        order === 'langFirst'
          ? await setInput({ document, inputKey: 'codeType', value: 'py' })
          : await setInput({ document, inputKey: 'code', value: pythonAlias });
      expect(first.warnings).toEqual([]);

      const second =
        order === 'langFirst'
          ? await setInput({ document: first.document, inputKey: 'code', value: pythonAlias })
          : await setInput({ document: first.document, inputKey: 'codeType', value: 'py' });
      expect(second.warnings).toEqual([]);
      expect(getDynamicOutputs(second.document)).toEqual([
        { key: 'summary', valueType: WorkflowIOValueTypeEnum.number },
        { key: 'remainder', valueType: WorkflowIOValueTypeEnum.any }
      ]);

      const bound = await applyWorkflowCommand({
        document: second.document,
        command: {
          type: 'input.ref',
          nodeId: 'answer',
          inputKey: 'text',
          ref: { nodeId: 'code', outputKey: 'remainder' }
        },
        dependencies
      });
      expect(bound.warnings).toEqual([]);
    }

    const arrowUpdated = await setInput({
      document,
      inputKey: 'code',
      value: 'const main = ({ data1 }) => { return { summary: data1, extra: data1 + 1 }; };'
    });
    expect(arrowUpdated.warnings).toEqual([]);
    expect(getDynamicOutputs(arrowUpdated.document)).toEqual([
      { key: 'summary', valueType: WorkflowIOValueTypeEnum.number },
      { key: 'extra', valueType: WorkflowIOValueTypeEnum.any }
    ]);
  });

  it('does not remove manually added outputs when re-writing the same codeType', async () => {
    let document = await createCodeDocument();
    document = (
      await setInput({
        document,
        inputKey: 'code',
        value: 'function main({ total, detail }) { return { result: total, ...detail }; }'
      })
    ).document;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'output.add',
          nodeId: 'code',
          output: {
            id: 'extra',
            key: 'extra',
            label: 'extra',
            type: FlowNodeOutputTypeEnum.dynamic,
            valueType: WorkflowIOValueTypeEnum.string
          }
        },
        dependencies
      })
    ).document;

    const repeated = await setInput({ document, inputKey: 'codeType', value: 'js' });
    expect(repeated.warnings).toEqual([]);
    expect(getDynamicOutputs(repeated.document)).toContainEqual({
      key: 'extra',
      valueType: WorkflowIOValueTypeEnum.string
    });
  });
});
