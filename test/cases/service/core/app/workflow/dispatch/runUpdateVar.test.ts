import { describe, it, expect, vi } from 'vitest';
import { dispatchUpdateVariable } from '@fastgpt/service/core/workflow/dispatch/tools/runUpdateVar';
import {
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { VariableUpdateOperatorEnum } from '@fastgpt/global/core/workflow/template/system/variableUpdate/constants';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

/** 构造最小 mock props */
const createMockProps = ({
  updateList,
  variables = {},
  runtimeNodes = []
}: {
  updateList: TUpdateListItem[];
  variables?: Record<string, any>;
  runtimeNodes?: Partial<RuntimeNodeItemType>[];
}) => {
  const allNodes = [
    {
      nodeId: VARIABLE_NODE_ID,
      name: 'Variables',
      inputs: [],
      outputs: []
    },
    ...runtimeNodes
  ] as RuntimeNodeItemType[];

  return {
    chatConfig: { variables: [] },
    params: { [NodeInputKeyEnum.updateList]: updateList },
    variables,
    runtimeNodes: allNodes,
    runtimeEdges: [],
    workflowStreamResponse: undefined,
    externalProvider: { externalWorkflowVariables: [] },
    runningAppInfo: {
      id: 'test-app',
      teamId: 'test-team',
      tmbId: 'test-tmb',
      name: 'Test App',
      isChildApp: true
    },
    checkIsStopping: () => false,
    mode: 'test' as const,
    timezone: 'Asia/Shanghai',
    runningUserInfo: {
      username: 'test',
      teamName: 'test',
      memberName: 'test',
      contact: '',
      teamId: 'test-team',
      tmbId: 'test-tmb'
    },
    uid: 'test-uid',
    chatId: 'test-chat',
    histories: [],
    query: [],
    stream: false,
    maxRunTimes: 100,
    workflowDispatchDeep: 0,
    node: allNodes[0],
    mcpClientMemory: {}
  } as any;
};

/** 构造全局变量更新项（新扁平格式） */
const createGlobalVarItem = (
  varKey: string,
  fields: Pick<TUpdateListItem, 'updateType' | 'inputValue' | 'referenceValue'>,
  valueType: WorkflowIOValueTypeEnum,
  renderType = FlowNodeInputTypeEnum.input
): TUpdateListItem => ({
  variable: [VARIABLE_NODE_ID, varKey],
  valueType,
  renderType,
  ...fields
});

/** 构造节点输出变量更新项 */
const createNodeOutputItem = (
  nodeId: string,
  outputId: string,
  fields: Pick<TUpdateListItem, 'updateType' | 'inputValue' | 'referenceValue'>,
  valueType: WorkflowIOValueTypeEnum
): TUpdateListItem => ({
  variable: [nodeId, outputId],
  valueType,
  renderType: FlowNodeInputTypeEnum.input,
  ...fields
});

describe('dispatchUpdateVariable - 运算操作符', () => {
  // ============ 数字运算 ============
  describe('数字运算', () => {
    it('set: 直接赋值为 42', async () => {
      const variables = { score: 0 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.set, inputValue: 42 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(42);
    });

    it('set: 空输入返回 null', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.set, inputValue: '' },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBeNull();
    });

    it('add: 原值 10 加 5 等于 15', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.add, inputValue: 5 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(15);
    });

    it('sub: 原值 10 减 3 等于 7', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.sub, inputValue: 3 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(7);
    });

    it('mul: 原值 10 乘 2 等于 20', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.mul, inputValue: 2 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(20);
    });

    it('div: 原值 10 除 4 等于 2.5', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.div, inputValue: 4 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(2.5);
    });

    it('div: 除以 0 保留原值', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.div, inputValue: 0 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(10);
    });

    it('add: 操作数为 NaN（undefined）时保留原值', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.add, inputValue: undefined },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(10);
    });

    it('同一变量多次更新：+5 再 ×2，原值 10 → 15 → 30', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.add, inputValue: 5 },
            WorkflowIOValueTypeEnum.number
          ),
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.mul, inputValue: 2 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(30);
    });

    it('变量未初始化（undefined）时作为 0 参与运算', async () => {
      const variables: Record<string, any> = {};
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.add, inputValue: 5 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(5);
    });
  });

  // ============ 布尔运算 ============
  describe('布尔运算', () => {
    it('set: True', async () => {
      const variables = { flag: false };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.set, inputValue: true },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('set: False', async () => {
      const variables = { flag: true };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.set, inputValue: false },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(false);
    });

    it('negate: 原值 true → false', async () => {
      const variables = { flag: true };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(false);
    });

    it('negate: 原值 false → true', async () => {
      const variables = { flag: false };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('negate: 原值为字符串 "false" → true（字符串自动转换）', async () => {
      const variables = { flag: 'false' };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('negate: 原值为字符串 "true" → false（字符串自动转换）', async () => {
      const variables = { flag: 'true' };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(false);
    });

    it('negate: 原值 undefined → true（!falsy = true）', async () => {
      const variables: Record<string, any> = {};
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('连续取反两次恢复原值', async () => {
      const variables = { flag: true };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          ),
          createGlobalVarItem(
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });
  });

  // ============ 数组运算 ============
  describe('数组运算', () => {
    it('set: 直接赋值数组', async () => {
      const variables = { list: ['a', 'b'] };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'list',
            { updateType: VariableUpdateOperatorEnum.set, inputValue: ['x', 'y'] },
            WorkflowIOValueTypeEnum.arrayString
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.list).toEqual(['x', 'y']);
    });

    it('push: 追加元素到末尾', async () => {
      const variables = { list: ['a', 'b'] };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'list',
            { updateType: VariableUpdateOperatorEnum.push, inputValue: 'x' },
            WorkflowIOValueTypeEnum.arrayString
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.list).toEqual(['a', 'b', 'x']);
    });

    it('clear: 清空数组', async () => {
      const variables = { list: ['a', 'b'] };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'list',
            { updateType: VariableUpdateOperatorEnum.clear },
            WorkflowIOValueTypeEnum.arrayString
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.list).toEqual([]);
    });

    it('push: 原值 undefined → [newItem]', async () => {
      const variables: Record<string, any> = {};
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'list',
            { updateType: VariableUpdateOperatorEnum.push, inputValue: 'x' },
            WorkflowIOValueTypeEnum.arrayString
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.list).toEqual(['x']);
    });

    it('clear: 原值 undefined → []', async () => {
      const variables: Record<string, any> = {};
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'list',
            { updateType: VariableUpdateOperatorEnum.clear },
            WorkflowIOValueTypeEnum.arrayString
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.list).toEqual([]);
    });
  });

  // ============ 旧数据兼容性（生产环境格式） ============
  describe('旧数据兼容性', () => {
    it('旧格式数字 ["", 10] → 直接赋值 10', async () => {
      const variables = { score: 0 };
      const props = createMockProps({
        updateList: [
          {
            variable: [VARIABLE_NODE_ID, 'score'],
            value: ['', 10],
            valueType: WorkflowIOValueTypeEnum.number,
            renderType: FlowNodeInputTypeEnum.input
          } as any
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(10);
    });

    it('旧格式布尔 ["", true] → 赋值 true', async () => {
      const variables = { flag: false };
      const props = createMockProps({
        updateList: [
          {
            variable: [VARIABLE_NODE_ID, 'flag'],
            value: ['', true],
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderType: FlowNodeInputTypeEnum.input
          } as any
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('旧格式布尔 ["", false] → 赋值 false', async () => {
      const variables = { flag: true };
      const props = createMockProps({
        updateList: [
          {
            variable: [VARIABLE_NODE_ID, 'flag'],
            value: ['', false],
            valueType: WorkflowIOValueTypeEnum.boolean,
            renderType: FlowNodeInputTypeEnum.input
          } as any
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(false);
    });

    it('旧格式字符串 ["", "hello"] → 赋值 "hello"', async () => {
      const variables = { text: '' };
      const props = createMockProps({
        updateList: [
          {
            variable: [VARIABLE_NODE_ID, 'text'],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          } as any
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.text).toBe('hello');
    });
  });

  // ============ 节点输出变量 ============
  describe('节点输出变量', () => {
    it('数字加法：更新节点输出', async () => {
      const runtimeNodes: Partial<RuntimeNodeItemType>[] = [
        {
          nodeId: 'node1',
          name: 'Node 1',
          inputs: [],
          outputs: [
            {
              id: 'output1',
              value: 10,
              key: 'output1',
              valueType: WorkflowIOValueTypeEnum.number,
              label: 'output1',
              type: 'static' as any
            }
          ]
        }
      ];
      const props = createMockProps({
        updateList: [
          createNodeOutputItem(
            'node1',
            'output1',
            { updateType: VariableUpdateOperatorEnum.add, inputValue: 5 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        runtimeNodes
      });

      await dispatchUpdateVariable(props);
      const node = (props.runtimeNodes as RuntimeNodeItemType[]).find((n) => n.nodeId === 'node1');
      expect(node?.outputs?.find((o) => o.id === 'output1')?.value).toBe(15);
    });

    it('布尔取反：更新节点输出', async () => {
      const runtimeNodes: Partial<RuntimeNodeItemType>[] = [
        {
          nodeId: 'node1',
          name: 'Node 1',
          inputs: [],
          outputs: [
            {
              id: 'flag',
              value: true,
              key: 'flag',
              valueType: WorkflowIOValueTypeEnum.boolean,
              label: 'flag',
              type: 'static' as any
            }
          ]
        }
      ];
      const props = createMockProps({
        updateList: [
          createNodeOutputItem(
            'node1',
            'flag',
            { updateType: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        runtimeNodes
      });

      await dispatchUpdateVariable(props);
      const node = (props.runtimeNodes as RuntimeNodeItemType[]).find((n) => n.nodeId === 'node1');
      expect(node?.outputs?.find((o) => o.id === 'flag')?.value).toBe(false);
    });
  });

  // ============ 边界情况 ============
  describe('边界情况', () => {
    it('未知 operator 兜底：返回 operand 值', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: 'unknown_op' as any, inputValue: 99 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(99);
    });

    it('set + undefined（数字类型）→ 返回 undefined', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { updateType: VariableUpdateOperatorEnum.set, inputValue: undefined },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBeUndefined();
    });

    it('push arrayObject：JSON 字符串 operand 自动解析为对象', async () => {
      const variables = { items: [{ id: 1 }] };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'items',
            { updateType: VariableUpdateOperatorEnum.push, inputValue: '{"id":2}' },
            WorkflowIOValueTypeEnum.arrayObject
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.items).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('push arrayString：字符串 operand 保持原样（不做 JSON 解析）', async () => {
      const variables = { list: ['a'] };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'list',
            { updateType: VariableUpdateOperatorEnum.push, inputValue: '{"not":"parsed"}' },
            WorkflowIOValueTypeEnum.arrayString
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.list).toEqual(['a', '{"not":"parsed"}']);
    });
  });
});
