import { describe, expect, it } from 'vitest';
import { VARIABLE_NODE_ID, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { dispatchIfElse } from '@fastgpt/service/core/workflow/dispatch/tools/runIfElse';

type DispatchProps = Parameters<typeof dispatchIfElse>[0];

const variableState = (variables: Record<string, unknown>) =>
  ({
    toRuntimeRecord: () => variables
  }) as DispatchProps['variableState'];

const ref = (key: string) => [VARIABLE_NODE_ID, key] as [string, string];

const edge = (sourceHandle: string) =>
  ({
    source: 'ifElse',
    target: `${sourceHandle}-target`,
    sourceHandle,
    targetHandle: 'target-left',
    status: 'waiting'
  }) as DispatchProps['runtimeEdges'][number];

const buildProps = ({
  ifElseList,
  value,
  sourceHandles
}: {
  ifElseList: IfElseListItemType[];
  value: string;
  sourceHandles: string[];
}) =>
  ({
    params: { ifElseList },
    node: { nodeId: 'ifElse' },
    runtimeEdges: sourceHandles.map(edge),
    runtimeNodesMap: new Map(),
    variableState: variableState({ input: value })
  }) as unknown as DispatchProps;

describe('dispatchIfElse branch handles', () => {
  it('should use legacy labels for old branches and skip stale source handles', async () => {
    const result = await dispatchIfElse(
      buildProps({
        value: 'b',
        ifElseList: [
          {
            condition: 'AND',
            list: [{ variable: ref('input'), condition: VariableConditionEnum.equalTo, value: 'a' }]
          },
          {
            condition: 'AND',
            list: [{ variable: ref('input'), condition: VariableConditionEnum.equalTo, value: 'b' }]
          }
        ],
        sourceHandles: [
          getHandleId('ifElse', 'source', IfElseResultEnum.IF),
          getHandleId('ifElse', 'source', `${IfElseResultEnum.ELSE_IF} 1`),
          getHandleId('ifElse', 'source', `${IfElseResultEnum.ELSE_IF} 2`),
          getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
        ]
      })
    );

    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(`${IfElseResultEnum.ELSE_IF} 1`);
    expect(result[DispatchNodeResponseKeyEnum.skipHandleId]).toEqual([
      getHandleId('ifElse', 'source', IfElseResultEnum.IF),
      getHandleId('ifElse', 'source', `${IfElseResultEnum.ELSE_IF} 2`),
      getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
    ]);
  });

  it('should use branchId as selected handle while keeping display result label', async () => {
    const result = await dispatchIfElse(
      buildProps({
        value: 'a',
        ifElseList: [
          {
            branchId: 'stableA',
            condition: 'AND',
            list: [{ variable: ref('input'), condition: VariableConditionEnum.equalTo, value: 'a' }]
          },
          {
            branchId: 'stableB',
            condition: 'AND',
            list: [{ variable: ref('input'), condition: VariableConditionEnum.equalTo, value: 'b' }]
          }
        ],
        sourceHandles: [
          getHandleId('ifElse', 'source', 'stableA'),
          getHandleId('ifElse', 'source', 'stableB'),
          getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
        ]
      })
    );

    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
    expect(result[DispatchNodeResponseKeyEnum.skipHandleId]).toEqual([
      getHandleId('ifElse', 'source', 'stableB'),
      getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
    ]);
  });
});
