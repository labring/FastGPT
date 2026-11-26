import {
  getConcurrentWorkflowFieldKeys,
  getConcurrentWorkflowOutputKeys,
  getCopilotRemovedOutputKeys,
  getCopilotUpdatedInputs
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/copilotUtils';
import { extractCodeFromMarkdown } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/parser';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { describe, expect, it } from 'vitest';

describe('getConcurrentWorkflowFieldKeys', () => {
  it('preserves fields changed, removed, or added after the optimization request', () => {
    const unchanged = { key: 'unchanged', value: 'before' };
    const edited = { key: 'edited', value: 'before' };
    const deleted = { key: 'deleted', value: 'before' };

    expect(
      getConcurrentWorkflowFieldKeys({
        requested: new Map([
          ['unchanged', unchanged],
          ['edited', edited],
          ['deleted', deleted]
        ]),
        current: [
          { ...unchanged },
          { ...edited, value: 'user edit' },
          { key: 'added', value: 'new' }
        ]
      })
    ).toEqual(new Set(['edited', 'deleted', 'added']));
  });

  it('keeps edges for outputs edited or removed while optimization is pending', () => {
    const unchanged = { key: 'unchanged', label: 'before' };
    const edited = { key: 'edited', label: 'before' };
    const deleted = { key: 'deleted', label: 'before' };

    expect(
      getCopilotRemovedOutputKeys({
        requested: new Map([
          ['unchanged', unchanged],
          ['edited', edited],
          ['deleted', deleted]
        ]),
        current: [unchanged, { ...edited, label: 'user label' }, { key: 'added', label: 'new' }],
        generatedKeys: new Set()
      })
    ).toEqual(['unchanged']);
  });

  it('keeps a new connection to an otherwise unchanged output', () => {
    const output = { key: 'result', label: 'result' };
    const requested = new Map([['result', output]]);
    const concurrentKeys = getConcurrentWorkflowOutputKeys({
      requested,
      current: [output],
      requestedConnections: new Map([['result', '[]']]),
      currentConnections: new Map([['result', '[["next","target"]]']])
    });

    expect(concurrentKeys).toEqual(new Set(['result']));
    expect(
      getCopilotRemovedOutputKeys({
        requested,
        current: [output],
        generatedKeys: new Set(),
        concurrentKeys
      })
    ).toEqual([]);
  });
});

describe('getCopilotUpdatedInputs', () => {
  const original: FlowNodeInputItemType = {
    key: 'extra',
    label: 'Extra text',
    renderTypeList: [FlowNodeInputTypeEnum.reference],
    defaultValue: 'fallback',
    value: ['start', 'original']
  };
  const requested = new Map([[original.key, original]]);

  it('keeps the existing input when the response omits input annotations', () => {
    const result = extractCodeFromMarkdown(
      'function main({ extra }) { return { result: extra }; }'
    );

    expect(getCopilotUpdatedInputs({ current: [original], requested, result })).toEqual([original]);
  });

  it('keeps existing bindings and adds explicit bindings when main uses rest parameters', () => {
    const result = extractCodeFromMarkdown(`
      /**
       * @param {string} extra - Keep the existing binding
       * @param {string} text [start.question] - Add a binding
       */
      function main({ ...params }) { return { result: params.extra + params.text }; }
    `);

    const inputs = getCopilotUpdatedInputs({ current: [original], requested, result });
    expect(inputs[0]).toEqual({ ...original, valueType: 'string' });
    expect(inputs[1]).toMatchObject({ key: 'text', value: ['start', 'question'] });
  });

  it('applies an explicit binding without dropping the existing field settings', () => {
    const result = extractCodeFromMarkdown(`
      /** @param {string} extra [start.question] */
      function main({ ...params }) { return { result: params.extra }; }
    `);

    const update = (current: FlowNodeInputItemType) =>
      getCopilotUpdatedInputs({ current: [current], requested, result });
    expect(update(original)).toEqual([
      { ...original, value: ['start', 'question'], valueType: 'string' }
    ]);

    const edited = { ...original, value: ['start', 'user-edit'] };
    expect(update(edited)).toEqual([edited]);
  });

  it('replaces an unchanged input omitted from the annotated list', () => {
    const result = extractCodeFromMarkdown(`
      /** @param {number} count [start.count] */
      function main({ count }) { return { count }; }
    `);

    expect(getCopilotUpdatedInputs({ current: [original], requested, result })).toEqual([
      expect.objectContaining({ key: 'count', value: ['start', 'count'] })
    ]);
  });
});
