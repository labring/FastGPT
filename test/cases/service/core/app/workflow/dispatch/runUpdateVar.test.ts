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
      isChildApp: true // 跳过 SSE 推送
    },
    // 其他必需字段
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

/** 构造全局变量更新项 */
const createGlobalVarItem = (
  varKey: string,
  value: any,
  valueType: WorkflowIOValueTypeEnum,
  renderType = FlowNodeInputTypeEnum.input
): TUpdateListItem => ({
  variable: [VARIABLE_NODE_ID, varKey],
  value: ['', value],
  valueType,
  renderType
});

/** 构造节点输出变量更新项 */
const createNodeOutputItem = (
  nodeId: string,
  outputId: string,
  value: any,
  valueType: WorkflowIOValueTypeEnum
): TUpdateListItem => ({
  variable: [nodeId, outputId],
  value: ['', value],
  valueType,
  renderType: FlowNodeInputTypeEnum.input
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
            { operator: VariableUpdateOperatorEnum.set, value: 42 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(42);
    });

    it('set: 空输入返回 null，不更新变量', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { operator: VariableUpdateOperatorEnum.set, value: '' },
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
            { operator: VariableUpdateOperatorEnum.add, value: 5 },
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
            { operator: VariableUpdateOperatorEnum.sub, value: 3 },
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
            { operator: VariableUpdateOperatorEnum.mul, value: 2 },
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
            { operator: VariableUpdateOperatorEnum.div, value: 4 },
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
            { operator: VariableUpdateOperatorEnum.div, value: 0 },
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
            { operator: VariableUpdateOperatorEnum.add, value: undefined },
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
            { operator: VariableUpdateOperatorEnum.add, value: 5 },
            WorkflowIOValueTypeEnum.number
          ),
          createGlobalVarItem(
            'score',
            { operator: VariableUpdateOperatorEnum.mul, value: 2 },
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
            { operator: VariableUpdateOperatorEnum.add, value: 5 },
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
            { operator: VariableUpdateOperatorEnum.set, value: true },
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
            { operator: VariableUpdateOperatorEnum.set, value: false },
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
            { operator: VariableUpdateOperatorEnum.negate },
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
            { operator: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('negate: 原值 undefined → true（!falsy = true）', async () => {
      const variables: Record<string, any> = {};
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'flag',
            { operator: VariableUpdateOperatorEnum.negate },
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
            { operator: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          ),
          createGlobalVarItem(
            'flag',
            { operator: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.boolean
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });
  });

  // ============ 旧数据兼容性 ============
  describe('旧数据兼容性', () => {
    it('旧格式数字 ["", 10] → 直接赋值 10', async () => {
      const variables = { score: 0 };
      const props = createMockProps({
        updateList: [createGlobalVarItem('score', 10, WorkflowIOValueTypeEnum.number)],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(10);
    });

    it('旧格式布尔 ["", true] → 赋值 true', async () => {
      const variables = { flag: false };
      const props = createMockProps({
        updateList: [createGlobalVarItem('flag', true, WorkflowIOValueTypeEnum.boolean)],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(true);
    });

    it('旧格式布尔 ["", false] → 赋值 false', async () => {
      const variables = { flag: true };
      const props = createMockProps({
        updateList: [createGlobalVarItem('flag', false, WorkflowIOValueTypeEnum.boolean)],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.flag).toBe(false);
    });

    it('旧格式字符串 ["", "hello"] → 赋值 "hello"', async () => {
      const variables = { text: '' };
      const props = createMockProps({
        updateList: [createGlobalVarItem('text', 'hello', WorkflowIOValueTypeEnum.string)],
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
            { operator: VariableUpdateOperatorEnum.add, value: 5 },
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
            { operator: VariableUpdateOperatorEnum.negate },
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
            { operator: 'unknown_op' as any, value: 99 },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBe(99);
    });

    it('negate + number → 对当前值取反', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { operator: VariableUpdateOperatorEnum.negate },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      // negate 对 number 类型直接取反：!10 → false
      expect(variables.score).toBe(false);
    });

    it('set + undefined（数字类型）→ 返回 null', async () => {
      const variables = { score: 10 };
      const props = createMockProps({
        updateList: [
          createGlobalVarItem(
            'score',
            { operator: VariableUpdateOperatorEnum.set, value: undefined },
            WorkflowIOValueTypeEnum.number
          )
        ],
        variables
      });

      await dispatchUpdateVariable(props);
      expect(variables.score).toBeNull();
    });
  });
});
