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
  sourceHandles,
  variables = {}
}: {
  ifElseList: IfElseListItemType[];
  value: unknown;
  sourceHandles: string[];
  variables?: Record<string, unknown>;
}) =>
  ({
    params: { ifElseList },
    node: { nodeId: 'ifElse' },
    runtimeEdges: sourceHandles.map(edge),
    runtimeNodesMap: new Map(),
    variableState: variableState({ ...variables, input: value })
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
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toBe(`${IfElseResultEnum.ELSE_IF} 1`);
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
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toBe(IfElseResultEnum.IF);
    expect(result[DispatchNodeResponseKeyEnum.skipHandleId]).toEqual([
      getHandleId('ifElse', 'source', 'stableB'),
      getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
    ]);
  });
});

describe('dispatchIfElse startWith / endWith', () => {
  const run = (value: unknown, condition: VariableConditionEnum, target: string) =>
    dispatchIfElse(
      buildProps({
        value,
        ifElseList: [
          {
            condition: 'AND',
            list: [{ variable: ref('input'), condition, value: target }]
          }
        ],
        sourceHandles: [
          getHandleId('ifElse', 'source', IfElseResultEnum.IF),
          getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
        ]
      })
    );

  it('should compare a non-string value of an any-typed variable as text', async () => {
    const startWith = await run(200, VariableConditionEnum.startWith, '2');
    expect(startWith.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const endWith = await run(200, VariableConditionEnum.endWith, '1');
    expect(endWith.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should not match a missing value', async () => {
    const result = await run(undefined, VariableConditionEnum.startWith, 'a');
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });
});

describe('dispatchIfElse include / notInclude', () => {
  const run = (value: unknown, condition: VariableConditionEnum, target: unknown) =>
    dispatchIfElse(
      buildProps({
        value,
        ifElseList: [
          {
            condition: 'AND',
            list: [
              {
                variable: ref('input'),
                condition,
                value: target as string
              }
            ]
          }
        ],
        sourceHandles: [
          getHandleId('ifElse', 'source', IfElseResultEnum.IF),
          getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
        ]
      })
    );

  it('should compare a non-string value of an any-typed variable as text', async () => {
    const include = await run(2001, VariableConditionEnum.include, '001');
    expect(include.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const notInclude = await run(2001, VariableConditionEnum.notInclude, '001');
    expect(notInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should match a boolean value of an any-typed variable as text', async () => {
    const include = await run(true, VariableConditionEnum.include, 'ru');
    expect(include.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const notInclude = await run(true, VariableConditionEnum.notInclude, 'ru');
    expect(notInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should still match array items and plain strings', async () => {
    const arrayInclude = await run(['a', 'b'], VariableConditionEnum.include, 'b');
    expect(arrayInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const stringInclude = await run('abcdef', VariableConditionEnum.include, 'cd');
    expect(stringInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const stringNotInclude = await run('abcdef', VariableConditionEnum.notInclude, 'xy');
    expect(stringNotInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('should not match a missing value', async () => {
    const result = await run(undefined, VariableConditionEnum.include, 'a');
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });
});

describe('dispatchIfElse regex', () => {
  const run = (value: unknown, pattern: unknown) =>
    dispatchIfElse(
      buildProps({
        value,
        ifElseList: [
          {
            condition: 'AND',
            list: [
              {
                variable: ref('input'),
                condition: VariableConditionEnum.reg,
                // 引用变量时，右侧的值可能不是字符串
                value: pattern as string
              }
            ]
          }
        ],
        sourceHandles: [
          getHandleId('ifElse', 'source', IfElseResultEnum.IF),
          getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
        ]
      })
    );
  const runReferencePattern = (value: unknown, pattern: unknown) =>
    dispatchIfElse(
      buildProps({
        value,
        variables: { pattern },
        ifElseList: [
          {
            condition: 'AND',
            list: [
              {
                variable: ref('input'),
                condition: VariableConditionEnum.reg,
                value: ref('pattern'),
                valueType: 'reference'
              }
            ]
          }
        ],
        sourceHandles: [
          getHandleId('ifElse', 'source', IfElseResultEnum.IF),
          getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
        ]
      })
    );

  it('should match a non-string value of an any-typed variable as text', async () => {
    const digits = await run(200, '/^\\d+$/');
    expect(digits.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const flag = await run(true, '^true$');
    expect(flag.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('should accept a non-string pattern from a reference variable', async () => {
    const result = await runReferencePattern('order 200 ok', 200);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('should not match an empty array pattern from a reference variable', async () => {
    const result = await runReferencePattern('anything', []);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should not match when the reference pattern is missing', async () => {
    const result = await runReferencePattern('anything', undefined);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should match the phone number example shown in the editor', async () => {
    const pattern = '/^((\\+|00)86)?1[3-9]\\d{9}$/';
    const phone = await run('+8613812345678', pattern);
    expect(phone.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const notPhone = await run('12345', pattern);
    expect(notPhone.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should not match a missing value', async () => {
    const result = await run(undefined, '.*');
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });
});
