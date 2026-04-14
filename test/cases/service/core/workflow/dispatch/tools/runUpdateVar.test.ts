import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchUpdateVariable } from '@fastgpt/service/core/workflow/dispatch/tools/runUpdateVar';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';

// Logger 不走真实实现，避免 log 基础设施依赖
vi.mock('../../../../../../../../packages/service/common/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }),
  LogCategories: {
    MODULE: {
      WORKFLOW: {
        DISPATCH: ['workflow', 'dispatch']
      }
    }
  }
}));

type AnyProps = Parameters<typeof dispatchUpdateVariable>[0];

const buildProps = (variables: Record<string, any>, updateList: TUpdateListItem[]): AnyProps => {
  const runtimeNodesMap = new Map();
  return {
    chatConfig: {},
    params: { updateList },
    variables,
    runtimeNodesMap,
    workflowStreamResponse: undefined,
    externalProvider: { externalWorkflowVariables: {} },
    runningAppInfo: { isChildApp: true }
  } as unknown as AnyProps;
};

const ref = (key: string) => [VARIABLE_NODE_ID, key] as [string, string];

describe('dispatchUpdateVariable — Number 公式', () => {
  it.each([
    ['+', 10, 3, 13],
    ['-', 10, 3, 7],
    ['*', 10, 3, 30],
    ['/', 10, 4, 2.5],
    ['=', 10, 3, 3]
  ] as const)('%s 运算：oldValue=%s input=%s 应为 %s', async (op, oldVal, input, expected) => {
    const variables = { counter: oldVal };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('counter'),
          value: ['', input],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input,
          numberOperator: op
        }
      ])
    );
    expect(variables.counter).toBe(expected);
  });

  it('除零：保持旧值', async () => {
    const variables = { counter: 10 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('counter'),
          value: ['', 0],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input,
          numberOperator: '/'
        }
      ])
    );
    expect(variables.counter).toBe(10);
  });

  it('缺省 numberOperator：按直接赋值（老数据兼容）', async () => {
    const variables = { counter: 10 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('counter'),
          value: ['', 99],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.counter).toBe(99);
  });
});

describe('dispatchUpdateVariable — Boolean', () => {
  it('true 模式', async () => {
    const variables = { flag: false };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('flag'),
          value: ['', ''],
          valueType: WorkflowIOValueTypeEnum.boolean,
          renderType: FlowNodeInputTypeEnum.input,
          booleanMode: 'true'
        }
      ])
    );
    expect(variables.flag).toBe(true);
  });

  it('false 模式', async () => {
    const variables = { flag: true };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('flag'),
          value: ['', ''],
          valueType: WorkflowIOValueTypeEnum.boolean,
          renderType: FlowNodeInputTypeEnum.input,
          booleanMode: 'false'
        }
      ])
    );
    expect(variables.flag).toBe(false);
  });

  it('negate：旧值为 true → false', async () => {
    const variables = { flag: true };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('flag'),
          value: ['', ''],
          valueType: WorkflowIOValueTypeEnum.boolean,
          renderType: FlowNodeInputTypeEnum.input,
          booleanMode: 'negate'
        }
      ])
    );
    expect(variables.flag).toBe(false);
  });

  it('negate：旧值非 boolean（字符串）按 !Boolean 处理', async () => {
    const variables = { flag: 'yes' as any };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('flag'),
          value: ['', ''],
          valueType: WorkflowIOValueTypeEnum.boolean,
          renderType: FlowNodeInputTypeEnum.input,
          booleanMode: 'negate'
        }
      ])
    );
    expect(variables.flag).toBe(false);
  });
});

describe('dispatchUpdateVariable — Array', () => {
  it('append：旧值数组', async () => {
    const variables = { list: [1, 2] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', 3],
          valueType: WorkflowIOValueTypeEnum.arrayNumber,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'append'
        }
      ])
    );
    expect(variables.list).toEqual([1, 2, 3]);
  });

  it('append：旧值非数组 → [newValue]', async () => {
    const variables = { list: null as any };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', 'a'],
          valueType: WorkflowIOValueTypeEnum.arrayString,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'append'
        }
      ])
    );
    expect(variables.list).toEqual(['a']);
  });

  it('append：字符串输入，元素类型为 number → 按 number 格式化', async () => {
    const variables = { list: [1] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', '42'], // 字符串输入
          valueType: WorkflowIOValueTypeEnum.arrayNumber,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'append'
        }
      ])
    );
    expect(variables.list).toEqual([1, 42]);
  });

  it('clear：置为空数组', async () => {
    const variables = { list: [1, 2, 3] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: undefined,
          valueType: WorkflowIOValueTypeEnum.arrayNumber,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'clear'
        }
      ])
    );
    expect(variables.list).toEqual([]);
  });

  it('equal：整数组替换（老数据兼容，arrayMode 缺省 === equal）', async () => {
    const variables = { list: [1, 2, 3] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', [9, 8]],
          valueType: WorkflowIOValueTypeEnum.arrayNumber,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.list).toEqual([9, 8]);
  });
});

describe('dispatchUpdateVariable — reference 模式忽略新字段', () => {
  it('reference 模式下 numberOperator 被忽略', async () => {
    const variables = { src: 5, dst: 10 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('dst'),
          value: ref('src'), // reference
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.reference,
          numberOperator: '+' // 残留字段，应被忽略
        }
      ])
    );
    // 若未忽略则为 10+5=15；忽略后直接赋值为 5
    expect(variables.dst).toBe(5);
  });

  it('reference 模式下 arrayMode=append 被忽略（整数组直接替换，不嵌套）', async () => {
    const variables = { src: [9, 8], dst: [1, 2] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('dst'),
          value: ref('src'),
          valueType: WorkflowIOValueTypeEnum.arrayNumber,
          renderType: FlowNodeInputTypeEnum.reference,
          arrayMode: 'append' // 残留字段，应被忽略
        }
      ])
    );
    // 若未忽略则为 [1,2,[9,8]]（嵌套）；忽略后直接赋值为 [9,8]
    expect(variables.dst).toEqual([9, 8]);
  });

  it('reference 模式下 booleanMode=negate 被忽略', async () => {
    const variables = { src: true, dst: false };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('dst'),
          value: ref('src'),
          valueType: WorkflowIOValueTypeEnum.boolean,
          renderType: FlowNodeInputTypeEnum.reference,
          booleanMode: 'negate'
        }
      ])
    );
    expect(variables.dst).toBe(true);
  });
});

describe('dispatchUpdateVariable — 多条 update 的顺序语义', () => {
  it('后一条读到前一条写入的值', async () => {
    const variables = { counter: 0 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('counter'),
          value: ['', 5],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input,
          numberOperator: '='
        },
        {
          variable: ref('counter'),
          value: ['', 3],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input,
          numberOperator: '+'
        }
      ])
    );
    // 第一条：counter = 5；第二条：5 + 3 = 8
    expect(variables.counter).toBe(8);
  });
});
