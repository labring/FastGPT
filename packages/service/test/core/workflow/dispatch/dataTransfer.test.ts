import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum, LoopRunModeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { RunWorkflowProps } from '@fastgpt/service/core/workflow/dispatch';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import {
  internalRuntimeNodeType,
  internalRuntimeNodeRunnerKey
} from '@fastgpt/service/core/workflow/dispatch/internal/runtimeNode';
import {
  graphNode,
  graphEdge,
  graphReference,
  graphValues,
  runGraph
} from './testUtils/workflowGraph';

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
  handle?: string;
  prepare?: (props: Partial<RunWorkflowProps>) => void;
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
    handle: 'ELSE',
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
    handle: 'yes',
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
  it('accounts for every registered dispatcher and checks editor placeholders', async () => {
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
    for (const type of placeholders) expect(await callbackMap[type]()).toBeUndefined();
  });

  it('internal runtime failures expose error outputs without leaking the original exception', async () => {
    const keys = [NodeOutputKeyEnum.errorText, 'rawError', 'stack', 'cause'];
    const source = graphNode({
      id: 'source',
      type: internalRuntimeNodeType as FlowNodeTypeEnum,
      isEntry: true,
      catchError: true,
      outputs: keys
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: keys.map((key) => graphReference({ key, from: ['source', key] })),
      outputs: keys
    });
    const { result } = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'source', target: 'target', error: true })]
    });
    expect(graphValues(target)).toEqual({
      [NodeOutputKeyEnum.errorText]: 'Internal runtime node runner is missing',
      rawError: undefined,
      stack: undefined,
      cause: undefined
    });
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
  });

  it.each(cases)(
    '$type: actual node output is readable by a downstream node',
    async ({ type, params = {}, expectedData, prepare, handle }) => {
      const keys = Object.keys(expectedData);
      const source = graphNode({
        id: 'source',
        type: type as FlowNodeTypeEnum,
        params,
        outputs: keys,
        isEntry: true
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: keys.map((key) => graphReference({ key, from: ['source', key] })),
        outputs: keys
      });
      const overrides: Partial<RunWorkflowProps> = {};
      prepare?.(overrides);
      if (overrides.lastInteractive) overrides.lastInteractive.entryNodeIds = ['source'];
      const { result: workflow, responses } = await runGraph({
        nodes: [source, target],
        edges: [graphEdge({ source: 'source', target: 'target', handle })],
        overrides
      });
      expect(graphValues(target)).toEqual(expectedData);
      expect(responses.some((response) => response.nodeId === 'target')).toBe(true);
      expect(workflow.workflowRuntimeSummary.errorCount).toBe(0);
      if (type === FlowNodeTypeEnum.pluginOutput)
        expect(workflow.workflowRuntimeSummary.pluginOutput).toEqual(params);
      if (type === FlowNodeTypeEnum.nestedEnd)
        expect(workflow.workflowRuntimeSummary.nestedEndOutput).toBe('finished');
      if (type === FlowNodeTypeEnum.stopTool)
        expect(workflow.workflowRuntimeSummary.hasToolStop).toBe(true);
      if (type === FlowNodeTypeEnum.customFeedback)
        expect(workflow.customFeedbacks).toEqual(['feedback']);
      if (type === FlowNodeTypeEnum.loopRunBreak)
        expect(workflow.workflowRuntimeSummary.hasLoopRunBreak).toBe(true);
    }
  );
});
