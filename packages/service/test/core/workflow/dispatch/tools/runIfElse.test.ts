import { describe, expect, it } from 'vitest';
import { VARIABLE_NODE_ID, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  IfElseResultEnum,
  VariableConditionEnum
} from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
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

  // 右侧选择引用变量时，运行时得到的是变量原始值，可能不是字符串
  const runReference = (value: unknown, condition: VariableConditionEnum, target: unknown) =>
    dispatchIfElse(
      buildProps({
        value,
        variables: { target },
        ifElseList: [
          {
            condition: 'AND',
            list: [
              {
                variable: ref('input'),
                condition,
                value: ref('target'),
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

  it.each([
    { input: 'order [x] done', target: '[x', expected: IfElseResultEnum.IF },
    { input: 'axb', target: 'a.b', expected: IfElseResultEnum.ELSE },
    { input: 'abc', target: '/abc/', expected: IfElseResultEnum.ELSE }
  ])(
    'should match reference text $target literally in $input',
    async ({ input, target, expected }) => {
      const include = await runReference(input, VariableConditionEnum.include, target);
      expect(include.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(expected);

      const notInclude = await runReference(input, VariableConditionEnum.notInclude, target);
      expect(notInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(
        expected === IfElseResultEnum.IF ? IfElseResultEnum.ELSE : IfElseResultEnum.IF
      );
    }
  );

  it('should match a non-string reference target against array items as text', async () => {
    const numberInclude = await runReference([200, 404], VariableConditionEnum.include, 200);
    expect(numberInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const numberNotInclude = await runReference([200, 404], VariableConditionEnum.notInclude, 404);
    expect(numberNotInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);

    const booleanInclude = await runReference([true, false], VariableConditionEnum.include, true);
    expect(booleanInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const textInclude = await runReference(['200'], VariableConditionEnum.include, 200);
    expect(textInclude.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('should compare an object reference target against array items by reference', async () => {
    const target = { id: 1 };
    const includeSame = await runReference([target], VariableConditionEnum.include, target);
    expect(includeSame.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);

    const includeDifferent = await runReference([{ id: 1 }], VariableConditionEnum.include, {
      id: 1
    });
    expect(includeDifferent.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('should not match a missing reference target against array items', async () => {
    const result = await runReference([200], VariableConditionEnum.include, undefined);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
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

  it.each([
    { pattern: String.raw`/^\d+$/`, input: '123', expected: IfElseResultEnum.IF },
    { pattern: 'a.b', input: 'axb', expected: IfElseResultEnum.IF },
    { pattern: String.raw`a\.b`, input: 'a.b', expected: IfElseResultEnum.IF },
    { pattern: String.raw`a\.b`, input: 'axb', expected: IfElseResultEnum.ELSE }
  ])(
    'should preserve regex semantics for reference $pattern',
    async ({ pattern, input, expected }) => {
      const result = await runReferencePattern(input, pattern);
      expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(expected);
    }
  );

  it('should throw on an invalid typed pattern', async () => {
    await expect(run('abc', '[')).rejects.toThrow(SyntaxError);
    await expect(run('abc', '(abc')).rejects.toThrow(SyntaxError);
    await expect(run('abc', '/[/')).rejects.toThrow(SyntaxError);
  });

  it.each(['[x', '(abc', 'a{2,1}', '/[/'])(
    'should reject invalid reference regex %s instead of converting it to text',
    async (pattern) => {
      await expect(runReferencePattern(pattern, pattern)).rejects.toThrow(SyntaxError);
    }
  );

  it.each([
    { pattern: '/', input: '/', expected: IfElseResultEnum.IF },
    { pattern: '/abc', input: 'abc', expected: IfElseResultEnum.ELSE },
    { pattern: 'abc/', input: 'abc', expected: IfElseResultEnum.ELSE },
    { pattern: String.raw`\/`, input: '/', expected: IfElseResultEnum.IF },
    { pattern: String.raw`/^\/$/`, input: '/', expected: IfElseResultEnum.IF },
    { pattern: String.raw`/abc\/`, input: '/abc/', expected: IfElseResultEnum.IF },
    { pattern: String.raw`/path\\/`, input: 'path\\', expected: IfElseResultEnum.IF }
  ])('should preserve content slashes in $pattern', async ({ pattern, input, expected }) => {
    const result = await run(input, pattern);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(expected);
  });

  it('should preserve an escaped slash from a reference pattern', async () => {
    const result = await runReferencePattern('/', String.raw`\/`);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it.each([{ pattern: '' }, { pattern: '//' }, { pattern: null }])(
    'should not match an empty or missing pattern $pattern',
    async ({ pattern }) => {
      const result = await run('anything', pattern);
      expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
    }
  );

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

/**
 * 通用单条件判断器执行帮手：左侧 input 变量值为 input，右侧比较值为字面量 value，
 * 返回完整 dispatch 结果。新增的覆盖测试块统一复用，避免重复构造 ifElseList。
 */
const runCondition = ({
  input,
  condition,
  value
}: {
  input: unknown;
  condition: VariableConditionEnum;
  value: unknown;
}) =>
  dispatchIfElse(
    buildProps({
      value: input,
      ifElseList: [
        {
          condition: 'AND',
          list: [{ variable: ref('input'), condition, value: value as string }]
        }
      ],
      sourceHandles: [
        getHandleId('ifElse', 'source', IfElseResultEnum.IF),
        getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
      ]
    })
  );

/** 断言单条件判断命中 IF 或 ELSE 分支。 */
const expectBranch = async ({
  input,
  condition,
  value,
  expected
}: {
  input: unknown;
  condition: VariableConditionEnum;
  value: unknown;
  expected: IfElseResultEnum;
}) => {
  const result = await runCondition({ input, condition, value });
  expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(expected);
};

/** 多条件聚合帮手：同一分支内多个条件，按 AND/OR 聚合。input 固定为 'a'，用 equalTo 'a'(真)/'b'(假) 控制条件结果。 */
const runMultiCondition = (
  condition: 'AND' | 'OR',
  items: { condition: VariableConditionEnum; value: string }[]
) =>
  dispatchIfElse(
    buildProps({
      value: 'a',
      ifElseList: [
        {
          condition,
          list: items.map((item) => ({
            variable: ref('input'),
            condition: item.condition,
            value: item.value
          }))
        }
      ],
      sourceHandles: [
        getHandleId('ifElse', 'source', IfElseResultEnum.IF),
        getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
      ]
    })
  );

/**
 * 多分支帮手：每个分支用 equalTo 与一个目标字符串比较 input，返回命中分支的 label。
 * sourceHandles 按分支数生成 IF / ELSE IF 1..N / ELSE。
 */
const runMultiBranch = (inputValue: unknown, targets: string[]) =>
  dispatchIfElse(
    buildProps({
      value: inputValue,
      ifElseList: targets.map((target) => ({
        condition: 'AND' as const,
        list: [{ variable: ref('input'), condition: VariableConditionEnum.equalTo, value: target }]
      })),
      sourceHandles: [
        getHandleId('ifElse', 'source', IfElseResultEnum.IF),
        ...targets
          .slice(1)
          .map((_, i) => getHandleId('ifElse', 'source', `${IfElseResultEnum.ELSE_IF} ${i + 1}`)),
        getHandleId('ifElse', 'source', IfElseResultEnum.ELSE)
      ]
    })
  );

// 以下 describe 块补全 runIfElse.ts 中此前未被测试覆盖的操作符分支，
// 只锁定行为明确正确的语义（跨类型比较、判空、length、AND/OR 聚合、多分支优先级），
// 不包含任何存疑的边界行为（如 null 被当作 0、Date 被判空等），那些将另行通过 issue 确认。

describe('dispatchIfElse equalTo / notEqual', () => {
  // 覆盖 runIfElse.ts:82-83 的 equalTo/notEqual：两侧均 String().trim() 比较。
  it.each([
    { input: 200, op: VariableConditionEnum.equalTo, target: '200', expected: IfElseResultEnum.IF },
    {
      input: true,
      op: VariableConditionEnum.equalTo,
      target: 'true',
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.equalTo,
      target: 'abc',
      expected: IfElseResultEnum.IF
    },
    {
      input: ' abc ',
      op: VariableConditionEnum.equalTo,
      target: 'abc',
      expected: IfElseResultEnum.IF
    },
    // 右侧空白也应被 trim，与左侧对称
    {
      input: 'abc',
      op: VariableConditionEnum.equalTo,
      target: ' abc ',
      expected: IfElseResultEnum.IF
    },
    {
      input: 200,
      op: VariableConditionEnum.notEqual,
      target: '200',
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 200,
      op: VariableConditionEnum.notEqual,
      target: '201',
      expected: IfElseResultEnum.IF
    }
  ])(
    'should compare $input via $op against $target as $expected',
    async ({ input, op, target, expected }) => {
      await expectBranch({ input, condition: op, value: target, expected });
    }
  );
});

describe('dispatchIfElse 数值比较 greaterThan / lessThan / >= / <=', () => {
  // 覆盖 runIfElse.ts:86-89 的数值比较：两侧 Number() 比较。锁定正常数值与跨类型 String→Number 的语义。
  it.each([
    { input: 10, op: VariableConditionEnum.greaterThan, target: 5, expected: IfElseResultEnum.IF },
    {
      input: 5,
      op: VariableConditionEnum.greaterThan,
      target: 10,
      expected: IfElseResultEnum.ELSE
    },
    { input: 5, op: VariableConditionEnum.lessThan, target: 10, expected: IfElseResultEnum.IF },
    { input: 10, op: VariableConditionEnum.lessThan, target: 5, expected: IfElseResultEnum.ELSE },
    {
      input: 10,
      op: VariableConditionEnum.greaterThanOrEqualTo,
      target: 10,
      expected: IfElseResultEnum.IF
    },
    {
      input: 9,
      op: VariableConditionEnum.greaterThanOrEqualTo,
      target: 10,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 5,
      op: VariableConditionEnum.lessThanOrEqualTo,
      target: 5,
      expected: IfElseResultEnum.IF
    },
    {
      input: 6,
      op: VariableConditionEnum.lessThanOrEqualTo,
      target: 5,
      expected: IfElseResultEnum.ELSE
    },
    // 跨类型：String→Number
    {
      input: '10',
      op: VariableConditionEnum.greaterThan,
      target: 9,
      expected: IfElseResultEnum.IF
    },
    {
      input: '10',
      op: VariableConditionEnum.greaterThan,
      target: 11,
      expected: IfElseResultEnum.ELSE
    }
  ])('should compare $input $op $target as $expected', async ({ input, op, target, expected }) => {
    await expectBranch({ input, condition: op, value: target, expected });
  });
});

describe('dispatchIfElse isEmpty / isNotEmpty', () => {
  // 覆盖 runIfElse.ts:34-48 的 isEmpty/isNotEmpty：判空函数对 null/undefined/空字符串/空数组/空对象返回 true。
  it.each([
    { input: null, op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.IF },
    { input: undefined, op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.IF },
    { input: '', op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.IF },
    { input: '   ', op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.IF },
    { input: [], op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.IF },
    { input: {}, op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.IF },
    { input: 0, op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.ELSE },
    { input: false, op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.ELSE },
    { input: '0', op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.ELSE },
    { input: 'false', op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.ELSE },
    { input: [0], op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.ELSE },
    { input: { a: 1 }, op: VariableConditionEnum.isEmpty, expected: IfElseResultEnum.ELSE },
    { input: null, op: VariableConditionEnum.isNotEmpty, expected: IfElseResultEnum.ELSE },
    { input: 0, op: VariableConditionEnum.isNotEmpty, expected: IfElseResultEnum.IF }
  ])('should judge $input via $op as $expected', async ({ input, op, expected }) => {
    await expectBranch({ input, condition: op, value: '', expected });
  });
});

describe('dispatchIfElse length 系列', () => {
  // 覆盖 runIfElse.ts:130-135 的 length* 操作符：inputValue?.length 与 Number(value) 比较。
  // 只锁定 string/array 的正常长度比较语义，每个操作符补命中与不命中反例。
  it.each([
    {
      input: 'abc',
      op: VariableConditionEnum.lengthEqualTo,
      target: 3,
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthEqualTo,
      target: 4,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthNotEqualTo,
      target: 4,
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthNotEqualTo,
      target: 3,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthGreaterThan,
      target: 2,
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthGreaterThan,
      target: 3,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthGreaterThanOrEqualTo,
      target: 3,
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthGreaterThanOrEqualTo,
      target: 4,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthLessThan,
      target: 4,
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthLessThan,
      target: 3,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthLessThanOrEqualTo,
      target: 3,
      expected: IfElseResultEnum.IF
    },
    {
      input: 'abc',
      op: VariableConditionEnum.lengthLessThanOrEqualTo,
      target: 2,
      expected: IfElseResultEnum.ELSE
    },
    {
      input: [1, 2, 3],
      op: VariableConditionEnum.lengthEqualTo,
      target: 3,
      expected: IfElseResultEnum.IF
    },
    {
      input: [1, 2, 3],
      op: VariableConditionEnum.lengthNotEqualTo,
      target: 2,
      expected: IfElseResultEnum.IF
    },
    {
      input: [1, 2, 3],
      op: VariableConditionEnum.lengthGreaterThan,
      target: 2,
      expected: IfElseResultEnum.IF
    },
    {
      input: [1, 2, 3],
      op: VariableConditionEnum.lengthLessThan,
      target: 5,
      expected: IfElseResultEnum.IF
    },
    {
      input: [1, 2, 3],
      op: VariableConditionEnum.lengthGreaterThanOrEqualTo,
      target: 3,
      expected: IfElseResultEnum.IF
    },
    {
      input: [1, 2, 3],
      op: VariableConditionEnum.lengthLessThanOrEqualTo,
      target: 3,
      expected: IfElseResultEnum.IF
    }
  ])(
    'should compare length of $input $op $target as $expected',
    async ({ input, op, target, expected }) => {
      await expectBranch({ input, condition: op, value: target, expected });
    }
  );
});

describe('dispatchIfElse AND / OR 聚合', () => {
  // 覆盖 runIfElse.ts:170 的 AND(every)/OR(some) 聚合。OR 此前完全未测。
  // 用 equalTo 构造可控的真/假条件：input='a' 时 equalTo 'a' 为真、equalTo 'b' 为假。
  const T = { condition: VariableConditionEnum.equalTo, value: 'a' };
  const F = { condition: VariableConditionEnum.equalTo, value: 'b' };

  it('OR 命中任一条件应选 IF', async () => {
    const result = await runMultiCondition('OR', [F, T]);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('OR 全假应选 ELSE', async () => {
    const result = await runMultiCondition('OR', [F, F]);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('AND 全真应选 IF', async () => {
    const result = await runMultiCondition('AND', [T, T]);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('AND 一假应选 ELSE', async () => {
    const result = await runMultiCondition('AND', [T, F]);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });

  it('3 条件 OR 中 1 真应选 IF', async () => {
    const result = await runMultiCondition('OR', [F, T, F]);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });
});

describe('dispatchIfElse 多分支优先级', () => {
  // 覆盖 dispatchIfElse:185-193 的分支遍历：第一个命中分支即 break，全不命中走 ELSE。
  // 此前仅用固定 branch handle 标签测过，未用真实条件验证匹配优先级。
  it('IF + ELSE IF 同时匹配应选 IF（第一个命中）', async () => {
    const result = await runMultiBranch('a', ['a', 'a']);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.IF);
  });

  it('两个 ELSE IF 同时匹配应选第一个 ELSE IF', async () => {
    const result = await runMultiBranch('a', ['b', 'a', 'a']);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(`${IfElseResultEnum.ELSE_IF} 1`);
  });

  it('全不匹配应走 ELSE', async () => {
    const result = await runMultiBranch('x', ['a', 'b']);
    expect(result.data?.[NodeOutputKeyEnum.ifElseResult]).toBe(IfElseResultEnum.ELSE);
  });
});
