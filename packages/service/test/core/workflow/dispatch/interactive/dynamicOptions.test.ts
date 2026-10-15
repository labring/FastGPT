import { describe, expect, it } from 'vitest';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { resolveInteractiveDynamicOptions } from '@fastgpt/service/core/workflow/dispatch/interactive/dynamicOptions';
import { dispatchUserSelect } from '@fastgpt/service/core/workflow/dispatch/interactive/userSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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

describe('dispatchUserSelect', () => {
  it('does not continue when the submitted value is not one of the dynamic options', async () => {
    const node = {
      nodeId: 'user-select',
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.userSelectOptions,
          renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference
        }
      ]
    };
    const result = await dispatchUserSelect({
      histories: [],
      node,
      params: {
        description: 'Choose one',
        userSelectOptions: [[VARIABLE_NODE_ID, 'options']]
      },
      query: [{ text: { content: 'not-an-option' } }],
      lastInteractive: { type: 'userSelect' },
      runtimeNodesMap: new Map(),
      variableState: createVariableState({ options: ['A', 'B'] }),
      chatConfig: {
        variables: [{ key: 'options', valueType: WorkflowIOValueTypeEnum.arrayString }]
      }
    } as any);

    expect(node.isEntry).toBe(true);
    expect(result[DispatchNodeResponseKeyEnum.interactive]).toMatchObject({
      type: 'userSelect',
      params: {
        userSelectOptions: [{ value: 'A' }, { value: 'B' }]
      }
    });
    expect(result.data).toBeUndefined();
  });
});
