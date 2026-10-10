import { describe, expect, it } from 'vitest';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { resolveInteractiveDynamicOptions } from '@fastgpt/service/core/workflow/dispatch/interactive/dynamicOptions';

const createVariableState = (values: Record<string, unknown>) => ({
  get: (key: string) => values[key]
});

describe('resolveInteractiveDynamicOptions', () => {
  it('preserves source order and duplicate values while expanding only arrayString', () => {
    const runtimeNodesMap = new Map([
      [
        'array-node',
        {
          outputs: [
            {
              id: 'items',
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: ['A', 'B']
            }
          ]
        }
      ],
      [
        'any-node',
        {
          outputs: [
            {
              id: 'items',
              valueType: WorkflowIOValueTypeEnum.arrayAny,
              value: ['A', 'B']
            }
          ]
        }
      ]
    ]) as any;

    expect(
      resolveInteractiveDynamicOptions({
        references: [
          ['array-node', 'items'],
          [VARIABLE_NODE_ID, 'title'],
          ['any-node', 'items'],
          [VARIABLE_NODE_ID, 'title']
        ],
        runtimeNodesMap,
        variableState: createVariableState({ title: 'A' }) as any,
        variablesConfig: [{ key: 'title', valueType: WorkflowIOValueTypeEnum.string }]
      })
    ).toEqual(['A', 'B', 'A', 'A,B', 'A']);
  });

  it('treats undeclared values as one string and ignores missing references', () => {
    expect(
      resolveInteractiveDynamicOptions({
        references: [
          [VARIABLE_NODE_ID, 'payload'],
          [VARIABLE_NODE_ID, 'missing'],
          ['missing-node', 'value']
        ],
        runtimeNodesMap: new Map(),
        variableState: createVariableState({ payload: { id: 'do-not-read' } }) as any
      })
    ).toEqual(['[object Object]']);
  });

  it('rejects declared value types that cannot be option sources', () => {
    expect(
      resolveInteractiveDynamicOptions({
        references: [['number-node', 'items']],
        runtimeNodesMap: new Map([
          [
            'number-node',
            {
              outputs: [
                {
                  id: 'items',
                  valueType: WorkflowIOValueTypeEnum.arrayNumber,
                  value: [1, 2]
                }
              ]
            }
          ]
        ]) as any,
        variableState: createVariableState({}) as any
      })
    ).toEqual([]);
  });
});
