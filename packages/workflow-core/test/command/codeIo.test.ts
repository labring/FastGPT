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

  it('keeps JavaScript IO when a comment quotes a Python signature', async () => {
    const getEditableIO = (document: Awaited<ReturnType<typeof createCodeDocument>>) => {
      const codeNode = document.nodes.find((node) => node.nodeId === 'code')!;
      return {
        inputs: codeNode.inputs.filter((input) => input.canEdit).map((input) => input.key),
        outputs: codeNode.outputs
          .filter(
            (output) =>
              output.type === FlowNodeOutputTypeEnum.dynamic &&
              output.key !== 'system_addOutputParam'
          )
          .map((output) => output.key)
      };
    };
    const body = `
      function main({ total, count }) {
        return { average: total / count, // rounded later
          remainder: total % count };
      }
    `;
    const setCode = async (
      document: Awaited<ReturnType<typeof createCodeDocument>>,
      value: string
    ) =>
      applyWorkflowCommand({
        document,
        command: { type: 'input.set', nodeId: 'code', inputKey: 'code', value },
        dependencies
      });

    const { document } = await setCode(await createCodeDocument(), body);
    expect(getEditableIO(document)).toEqual({
      inputs: ['total', 'count'],
      outputs: ['average', 'remainder']
    });

    const result = await setCode(document, `/*\ndef main(legacy):\n*/${body}`);
    expect(getEditableIO(result.document)).toEqual(getEditableIO(document));
    expect(result.warnings).toEqual([]);
  });

  it('syncs JavaScript inputs when ordinary statements precede the entry', async () => {
    const setCode = async (
      document: Awaited<ReturnType<typeof createCodeDocument>>,
      value: string
    ) =>
      (
        await applyWorkflowCommand({
          document,
          command: { type: 'input.set', nodeId: 'code', inputKey: 'code', value },
          dependencies
        })
      ).document;
    const getEditableInputs = (document: Awaited<ReturnType<typeof createCodeDocument>>) =>
      document.nodes
        .find((node) => node.nodeId === 'code')!
        .inputs.filter((input) => input.canEdit)
        .map((input) => input.key);
    const preludes = [
      // 成员名 `in` 后面的 `/` 是除号。
      'const limits = { in: 4 };\nconst scale = limits.in / 2;',
      // 内层模板里的撇号不是字符串开头。
      "const label = `Report: ${`Today's total`}`;"
    ];

    for (const prelude of preludes) {
      const document = await setCode(
        await createCodeDocument(),
        'function main({ total, count }) { return { average: total / count }; }'
      );
      expect(getEditableInputs(document)).toEqual(['total', 'count']);

      const nextDocument = await setCode(
        document,
        `${prelude}\nfunction main({ total }) { return { average: total }; }`
      );
      expect(getEditableInputs(nextDocument)).toEqual(['total']);
    }
  });

  it('keeps Python IO when a docstring quotes a JavaScript signature', async () => {
    const run = async (
      document: Awaited<ReturnType<typeof createCodeDocument>>,
      command: { inputKey: string; value: string }
    ) =>
      applyWorkflowCommand({
        document,
        command: { type: 'input.set', nodeId: 'code', ...command },
        dependencies
      });
    const getEditableIO = (document: Awaited<ReturnType<typeof createCodeDocument>>) => {
      const codeNode = document.nodes.find((node) => node.nodeId === 'code')!;
      return {
        inputs: codeNode.inputs.filter((input) => input.canEdit).map((input) => input.key),
        outputs: codeNode.outputs
          .filter(
            (output) =>
              output.type === FlowNodeOutputTypeEnum.dynamic &&
              output.key !== 'system_addOutputParam'
          )
          .map((output) => output.key)
      };
    };
    const getCode = (docstring: string) =>
      [
        'def main(total, count):',
        docstring,
        '    return {',
        '        "average": total // count,',
        '        "remainder": total % count',
        '    }'
      ].join('\n');

    let { document } = await run(await createCodeDocument(), { inputKey: 'codeType', value: 'py' });
    ({ document } = await run(document, { inputKey: 'code', value: getCode('    pass') }));
    expect(getEditableIO(document)).toEqual({
      inputs: ['total', 'count'],
      outputs: ['average', 'remainder']
    });

    const result = await run(document, {
      inputKey: 'code',
      value: getCode('    """The old entry was "function main({ legacy })" in JavaScript."""')
    });
    expect(getEditableIO(result.document)).toEqual(getEditableIO(document));
    expect(result.warnings).toEqual([]);
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
});
