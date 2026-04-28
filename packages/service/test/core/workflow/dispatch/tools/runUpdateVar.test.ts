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

type BuildOpts = {
  runtimeNodesMap?: Map<string, any>;
  workflowStreamResponse?: (payload: any) => void;
  isChildApp?: boolean;
  chatConfig?: any;
  externalWorkflowVariables?: Record<string, any>;
};

const buildProps = (
  variables: Record<string, any>,
  updateList: TUpdateListItem[],
  opts: BuildOpts = {}
): AnyProps => {
  const runtimeNodesMap = opts.runtimeNodesMap ?? new Map();
  return {
    chatConfig: opts.chatConfig ?? {},
    params: { updateList },
    variables,
    runtimeNodesMap,
    workflowStreamResponse: opts.workflowStreamResponse,
    externalProvider: { externalWorkflowVariables: opts.externalWorkflowVariables ?? {} },
    runningAppInfo: { isChildApp: opts.isChildApp ?? true }
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

  it('append：arrayBoolean 元素类型 → 按 boolean 格式化', async () => {
    const variables = { list: [true] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', false],
          valueType: WorkflowIOValueTypeEnum.arrayBoolean,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'append'
        }
      ])
    );
    expect(variables.list).toEqual([true, false]);
  });

  it('append：arrayObject 元素类型 → 按 object 格式化', async () => {
    const variables = { list: [{ a: 1 }] };
    const obj = { b: 2 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', obj],
          valueType: WorkflowIOValueTypeEnum.arrayObject,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'append'
        }
      ])
    );
    expect(variables.list).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('append：arrayAny 元素类型 → 走 default 分支（any）', async () => {
    const variables = { list: [1] };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('list'),
          value: ['', 'mixed'],
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          renderType: FlowNodeInputTypeEnum.input,
          arrayMode: 'append'
        }
      ])
    );
    expect(variables.list).toEqual([1, 'mixed']);
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

describe('dispatchUpdateVariable — 老数据向前兼容（无新字段）', () => {
  it('Boolean 无 booleanMode：直接写入 value[1]（老数据语义）', async () => {
    const variables = { flag: false };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('flag'),
          value: ['', true],
          valueType: WorkflowIOValueTypeEnum.boolean,
          renderType: FlowNodeInputTypeEnum.input
          // 无 booleanMode
        }
      ])
    );
    expect(variables.flag).toBe(true);
  });

  it('String input：模板字符串走 replaceEditorVariable 替换（老路径未变）', async () => {
    const variables = { name: 'old', greeting: '' };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('greeting'),
          value: ['', 'hello {{name}}'],
          valueType: WorkflowIOValueTypeEnum.string,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.greeting).toContain('hello');
    // 实际替换由 replaceEditorVariable 决定，仅保证不抛错且结果为 string
    expect(typeof variables.greeting).toBe('string');
  });

  it('Object input：直接写入对象引用（老数据，无新字段）', async () => {
    const variables = { obj: { a: 1 } as any };
    const next = { b: 2 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('obj'),
          value: ['', next],
          valueType: WorkflowIOValueTypeEnum.object,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.obj).toEqual({ b: 2 });
  });

  it('reference 模式：跨节点读取另一个节点 output → 写入全局变量（老路径）', async () => {
    const srcNodeId = 'node-src';
    const runtimeNodesMap = new Map<string, any>([
      [srcNodeId, { outputs: [{ id: 'out', value: 42 }] }]
    ]);
    const variables = { dst: 0 };
    await dispatchUpdateVariable(
      buildProps(
        variables,
        [
          {
            variable: ref('dst'),
            value: [srcNodeId, 'out'],
            valueType: WorkflowIOValueTypeEnum.number,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ],
        { runtimeNodesMap }
      )
    );
    expect(variables.dst).toBe(42);
  });

  it('valueType 缺省：valueTypeFormat 走默认路径，原值透传', async () => {
    const variables = { mixed: null as any };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('mixed'),
          value: ['', { x: 1 }],
          // 无 valueType，无新字段
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.mixed).toEqual({ x: 1 });
  });

  it('返回值结构：newVariables + updateVarResult 与老接口一致', async () => {
    const variables = { a: 0, b: 0 };
    const res = await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ref('a'),
          value: ['', 1],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input
        },
        {
          variable: ['unknown', 'x'] as [string, string], // 非法 → null
          value: ['', 9],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect((res as any).newVariables).toBe(variables);
    expect((res as any).responseData?.updateVarResult).toEqual([1, null]);
  });
});

describe('dispatchUpdateVariable — 写回 runtime 节点输出', () => {
  it('varNodeId 非 VARIABLE_NODE_ID：写入对应节点 output.value', async () => {
    const nodeId = 'node-A';
    const runtimeNodesMap = new Map<string, any>([
      [
        nodeId,
        {
          outputs: [
            { id: 'out1', value: 1 },
            { id: 'out2', value: 'old' }
          ]
        }
      ]
    ]);

    await dispatchUpdateVariable(
      buildProps(
        {},
        [
          {
            variable: [nodeId, 'out2'] as [string, string],
            value: ['', 'new'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ],
        { runtimeNodesMap }
      )
    );
    expect(runtimeNodesMap.get(nodeId).outputs[1].value).toBe('new');
    // 其它 output 不受影响
    expect(runtimeNodesMap.get(nodeId).outputs[0].value).toBe(1);
  });

  it('varNodeId 非 VARIABLE_NODE_ID：Number 公式读取 output.value 作为 oldValue', async () => {
    const nodeId = 'node-N';
    const runtimeNodesMap = new Map<string, any>([
      [nodeId, { outputs: [{ id: 'cnt', value: 7 }] }]
    ]);
    await dispatchUpdateVariable(
      buildProps(
        {},
        [
          {
            variable: [nodeId, 'cnt'] as [string, string],
            value: ['', 3],
            valueType: WorkflowIOValueTypeEnum.number,
            renderType: FlowNodeInputTypeEnum.input,
            numberOperator: '+'
          }
        ],
        { runtimeNodesMap }
      )
    );
    expect(runtimeNodesMap.get(nodeId).outputs[0].value).toBe(10);
  });
});

describe('dispatchUpdateVariable — 非法引用 / 缺省 key', () => {
  it('variable 非合法引用：跳过该条', async () => {
    const variables = { counter: 1 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: ['unknown-node', 'foo'] as [string, string], // 不在 runtimeNodesMap 中且非 VARIABLE_NODE_ID
          value: ['', 99],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.counter).toBe(1);
  });

  it('varKey 缺失：跳过该条', async () => {
    const variables = { counter: 1 };
    await dispatchUpdateVariable(
      buildProps(variables, [
        {
          variable: [VARIABLE_NODE_ID, ''] as [string, string],
          value: ['', 99],
          valueType: WorkflowIOValueTypeEnum.number,
          renderType: FlowNodeInputTypeEnum.input
        }
      ])
    );
    expect(variables.counter).toBe(1);
  });
});

describe('dispatchUpdateVariable — 流式回调', () => {
  it('isChildApp=false：调用 workflowStreamResponse 推送 updateVariables 事件', async () => {
    const spy = vi.fn();
    const variables = { counter: 0 };
    await dispatchUpdateVariable(
      buildProps(
        variables,
        [
          {
            variable: ref('counter'),
            value: ['', 5],
            valueType: WorkflowIOValueTypeEnum.number,
            renderType: FlowNodeInputTypeEnum.input,
            numberOperator: '='
          }
        ],
        { isChildApp: false, workflowStreamResponse: spy }
      )
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0];
    expect(payload.event).toBe('updateVariables');
    expect(payload.data).toBeDefined();
  });

  it('isChildApp=true：不触发 workflowStreamResponse', async () => {
    const spy = vi.fn();
    await dispatchUpdateVariable(
      buildProps(
        { counter: 0 },
        [
          {
            variable: ref('counter'),
            value: ['', 1],
            valueType: WorkflowIOValueTypeEnum.number,
            renderType: FlowNodeInputTypeEnum.input,
            numberOperator: '='
          }
        ],
        { isChildApp: true, workflowStreamResponse: spy }
      )
    );
    expect(spy).not.toHaveBeenCalled();
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
