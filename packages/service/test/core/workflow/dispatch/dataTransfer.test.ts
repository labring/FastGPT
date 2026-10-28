import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum, LoopRunModeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ModuleDispatchProps } from '@fastgpt/service/core/workflow/types/runtime';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import {
  internalRuntimeNodeType,
  internalRuntimeNodeRunnerKey
} from '@fastgpt/service/core/workflow/dispatch/internal/runtimeNode';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { expectNodeDataToReachDownstream } from './testUtils/dataTransfer';

vi.mock('@fastgpt/service/common/string/tiktoken/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/string/tiktoken/index')>()),
  countPromptTokensBatch: async (texts: string[]) => texts.map((text) => text.length)
}));

vi.mock('@fastgpt/service/core/ai/functions/queryExtension', () => ({
  queryExtension: vi.fn(async () => ({
    extensionQueries: ['expanded'],
    inputTokens: 1,
    outputTokens: 1,
    embeddingTokens: 1
  }))
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getTeamModelHandle: async () => ({
    getDefaultModelData: () => ({ modelId: 'embedding', config: {} })
  })
}));
vi.mock('@fastgpt/service/core/workflow/resource/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/resource/service')>()),
  loadWorkflowModelResource: async () => ({ modelId: 'model', name: 'model', config: {} })
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/utils')>()),
  formatModelChars2Points: () => ({ totalPoints: 0 })
}));

type DataCase = {
  type: keyof typeof callbackMap;
  params?: Record<string, unknown>;
  expectedData: Record<string, unknown>;
  prepare?: (props: ModuleDispatchProps<Record<string, any>>) => void;
};

const cases: DataCase[] = [
  {
    type: FlowNodeTypeEnum.workflowStart,
    params: { userChatInput: 'question' },
    expectedData: { userChatInput: 'question', userFiles: [] }
  },
  {
    type: FlowNodeTypeEnum.pluginInput,
    params: { value: { nested: [0, false, ''] } },
    expectedData: { value: { nested: [0, false, ''] }, userFiles: [] }
  },
  { type: FlowNodeTypeEnum.pluginOutput, params: { result: 'finished' }, expectedData: {} },
  { type: FlowNodeTypeEnum.stopTool, expectedData: {} },
  {
    type: FlowNodeTypeEnum.toolParams,
    params: {
      zero: 0,
      flag: false,
      empty: '',
      array: [],
      object: { value: 'ok' },
      error: 'business output'
    },
    expectedData: {
      zero: 0,
      flag: false,
      empty: '',
      array: [],
      object: { value: 'ok' },
      error: 'business output'
    }
  },
  {
    type: FlowNodeTypeEnum.answerNode,
    params: { text: 'answer' },
    expectedData: { answerText: '\nanswer' }
  },
  {
    type: FlowNodeTypeEnum.datasetConcatNode,
    params: { first: [], second: [] },
    expectedData: { quoteQA: [] }
  },
  {
    type: FlowNodeTypeEnum.ifElseNode,
    params: { ifElseList: [] },
    expectedData: { ifElseResult: 'ELSE' }
  },
  { type: FlowNodeTypeEnum.variableUpdate, params: { updateList: [] }, expectedData: {} },
  {
    type: FlowNodeTypeEnum.textEditor,
    params: { [NodeInputKeyEnum.textareaInput]: 'text' },
    expectedData: { [NodeOutputKeyEnum.text]: 'text' }
  },
  {
    type: FlowNodeTypeEnum.customFeedback,
    params: { [NodeInputKeyEnum.textareaInput]: 'feedback' },
    expectedData: {}
  },
  {
    type: FlowNodeTypeEnum.userSelect,
    params: { userSelectOptions: [{ key: 'yes', value: 'yes' }] },
    expectedData: { selectResult: 'yes' },
    prepare: (props) => {
      props.query = [{ text: { content: 'yes' } }];
      props.lastInteractive = { type: 'userSelect', params: {} } as any;
    }
  },
  {
    type: FlowNodeTypeEnum.formInput,
    params: { userInputForms: [] },
    expectedData: {
      value: 0,
      flag: false,
      [NodeOutputKeyEnum.formInputResult]: { value: 0, flag: false }
    },
    prepare: (props) => {
      props.query = [{ text: { content: '{"value":0,"flag":false}' } }];
      props.lastInteractive = { type: 'userInput', params: {} } as any;
    }
  },
  {
    type: FlowNodeTypeEnum.nestedStart,
    params: {
      [NodeInputKeyEnum.nestedStartInput]: { value: 'item' },
      [NodeInputKeyEnum.nestedStartIndex]: 0
    },
    expectedData: {
      [NodeOutputKeyEnum.nestedStartInput]: { value: 'item' },
      [NodeOutputKeyEnum.nestedStartIndex]: 0
    }
  },
  {
    type: FlowNodeTypeEnum.nestedEnd,
    params: { [NodeInputKeyEnum.nestedEndInput]: 'finished' },
    expectedData: {}
  },
  {
    type: FlowNodeTypeEnum.loopRunStart,
    params: {
      [NodeInputKeyEnum.loopRunMode]: LoopRunModeEnum.array,
      [NodeInputKeyEnum.nestedStartInput]: { value: 'item' },
      [NodeInputKeyEnum.nestedStartIndex]: 0
    },
    expectedData: {
      [NodeOutputKeyEnum.currentIndex]: 0,
      [NodeOutputKeyEnum.currentItem]: { value: 'item' }
    }
  },
  { type: FlowNodeTypeEnum.loopRunBreak, expectedData: {} },
  {
    type: internalRuntimeNodeType,
    params: { [internalRuntimeNodeRunnerKey]: () => ({ data: { value: { nested: [1, false] } } }) },
    expectedData: { value: { nested: [1, false] } }
  },
  {
    type: FlowNodeTypeEnum.loop,
    params: { loopInputArray: [], childrenNodeIdList: [] },
    expectedData: { [NodeOutputKeyEnum.nestedArrayResult]: [] }
  },
  {
    type: FlowNodeTypeEnum.queryExtension,
    params: { userChatInput: 'original' },
    expectedData: { [NodeOutputKeyEnum.text]: '["original","expanded"]' }
  }
];

describe('registered node data transfer', () => {
  it('accounts for every registered dispatcher in the data-transfer suite', () => {
    // 这些节点的真实成功/失败返回值由各自的外部依赖 fixture 测试验证，并共用相同下游断言。
    const dedicatedNodeTypes = [
      FlowNodeTypeEnum.appModule,
      FlowNodeTypeEnum.pluginModule,
      FlowNodeTypeEnum.agent,
      FlowNodeTypeEnum.chatNode,
      FlowNodeTypeEnum.datasetSearchNode,
      FlowNodeTypeEnum.classifyQuestion,
      FlowNodeTypeEnum.contentExtract,
      FlowNodeTypeEnum.toolCall,
      FlowNodeTypeEnum.httpRequest468,
      FlowNodeTypeEnum.code,
      FlowNodeTypeEnum.readFiles,
      FlowNodeTypeEnum.parallelRun,
      FlowNodeTypeEnum.loopRun,
      FlowNodeTypeEnum.tool,
      FlowNodeTypeEnum.runApp
    ];
    const placeholders = [
      FlowNodeTypeEnum.emptyNode,
      FlowNodeTypeEnum.globalVariable,
      FlowNodeTypeEnum.comment,
      FlowNodeTypeEnum.toolSet
    ];
    const covered = [...cases.map((item) => item.type), ...dedicatedNodeTypes, ...placeholders];
    expect([...new Set(covered)].sort()).toEqual(Object.keys(callbackMap).sort());
    expect(covered.length).toBe(Object.keys(callbackMap).length);
  });

  it('internal runtime runner failures expose display data while retaining an Error object', async () => {
    const result: any = await callbackMap[internalRuntimeNodeType]({ params: {} });
    expect(result.error).toBeInstanceOf(Error);
    await expectNodeDataToReachDownstream({
      nodeType: internalRuntimeNodeType as any,
      result,
      expectedData: { [NodeOutputKeyEnum.errorText]: 'Internal runtime node runner is missing' }
    });
  });

  it.each(cases)(
    '$type: actual node output is readable by a downstream node',
    async ({ type, params = {}, expectedData, prepare }) => {
      const variableState = await WorkflowVariableState.create({
        timezone: 'Asia/Shanghai',
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app',
          name: 'app',
          teamId: 'team',
          tmbId: 'member'
        },
        uid: 'user',
        chatId: 'chat',
        histories: [],
        variablesConfig: []
      });
      const props = {
        node: {
          nodeId: 'source',
          name: type,
          avatar: '',
          flowNodeType: type,
          isEntry: true,
          inputs: [],
          outputs: []
        },
        params,
        query: [],
        histories: [],
        runtimeNodes: [],
        runtimeNodesMap: new Map(),
        runtimeEdges: [],
        variableState,
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app',
          name: 'app',
          teamId: 'team',
          tmbId: 'member'
        },
        runningUserInfo: { teamId: 'team', tmbId: 'member' },
        externalProvider: {},
        chatConfig: {},
        usagePush: vi.fn(),
        nodeSummary: createNodeSummary(),
        checkIsStopping: () => false
      } as unknown as ModuleDispatchProps<Record<string, any>>;
      prepare?.(props);
      const result = (await callbackMap[type](props)) as any;
      expect(Object.hasOwn(result, 'error')).toBe(false);
      const queue = await expectNodeDataToReachDownstream({
        nodeType: type as any,
        result,
        expectedData
      });
      if (type === FlowNodeTypeEnum.pluginOutput)
        expect(queue.workflowRuntimeSummary.pluginOutput).toEqual(params);
      if (type === FlowNodeTypeEnum.nestedEnd)
        expect(queue.workflowRuntimeSummary.nestedEndOutput).toBe('finished');
      if (type === FlowNodeTypeEnum.stopTool)
        expect(queue.workflowRuntimeSummary.hasToolStop).toBe(true);
      if (type === FlowNodeTypeEnum.customFeedback)
        expect(queue.customFeedbackList).toEqual(['feedback']);
      if (type === FlowNodeTypeEnum.loopRunBreak)
        expect(queue.workflowRuntimeSummary.hasLoopRunBreak).toBe(true);
    }
  );

  it.each([FlowNodeTypeEnum.userSelect, FlowNodeTypeEnum.formInput])(
    '%s pauses without data until user input arrives',
    async (type) => {
      const result: any = await callbackMap[type]({
        node: { nodeId: 'pending', isEntry: false, inputs: [] },
        params: { userSelectOptions: [{ key: 'yes', value: 'yes' }], userInputForms: [] }
      });
      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(result[DispatchNodeResponseKeyEnum.interactive]).toBeDefined();
      await expectNodeDataToReachDownstream({
        nodeType: type,
        result,
        expectedData: {},
        expectPause: true
      });
    }
  );

  it.each([
    FlowNodeTypeEnum.emptyNode,
    FlowNodeTypeEnum.globalVariable,
    FlowNodeTypeEnum.comment,
    FlowNodeTypeEnum.toolSet
  ])('%s is an editor placeholder without a runtime output', async (type) => {
    expect(await callbackMap[type]()).toBeUndefined();
  });
});
