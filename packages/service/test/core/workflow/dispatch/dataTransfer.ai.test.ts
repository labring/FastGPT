import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  graphNode,
  graphEdge,
  graphReference,
  graphValues,
  runGraph
} from './testUtils/workflowGraph';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: requestMock }));
vi.mock('@fastgpt/service/core/workflow/resource/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/resource/service')>()),
  loadWorkflowModelResource: vi.fn(async () => ({
    modelId: 'model',
    model: 'fixture',
    name: 'Fixture Model',
    provider: 'openai',
    config: { maxContext: 8192, maxResponse: 2048, quoteMaxToken: 4096 }
  }))
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/wallet/usage/utils')>()),
  formatModelChars2Points: () => ({ totalPoints: 0 })
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/string/tiktoken/index')>()),
  countGptMessagesTokens: vi.fn(async () => 10),
  countGptMessagesTokensBatch: vi.fn(async (groups: unknown[]) => groups.map(() => 10)),
  countMessagesTokens: vi.fn(async () => 10),
  countPromptTokens: vi.fn(async () => 10),
  countPromptTokensBatch: vi.fn(async (prompts: unknown[]) => prompts.map(() => 10))
}));

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({
    completeMessages: [
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' }
    ],
    answerText: 'answer',
    reasoningText: 'reason',
    finish_reason: 'stop',
    requestId: 'fixture-request',
    usage: { inputTokens: 3, outputTokens: 2, usedUserOpenAIKey: false }
  });
});

const aiCases = [
  { type: FlowNodeTypeEnum.chatNode, params: { userChatInput: 'question' } },
  {
    type: FlowNodeTypeEnum.classifyQuestion,
    params: {
      userChatInput: 'question',
      agents: [
        { key: 'yes', value: 'yes' },
        { key: 'fallback', value: 'fallback' }
      ]
    }
  },
  {
    type: FlowNodeTypeEnum.contentExtract,
    params: { content: 'input', extractKeys: [{ key: 'value', desc: 'value', required: true }] }
  }
];

describe('AI nodes in complete workflow graphs', () => {
  it.each(aiCases)(
    '$type forwards an upstream exception through its real catch branch',
    async ({ type, params }) => {
      const error = new Error('model server failed');
      requestMock.mockRejectedValueOnce(error);
      const source = graphNode({
        id: 'ai',
        type,
        params,
        outputs: [NodeOutputKeyEnum.errorText, 'stack'],
        isEntry: true,
        catchError: true
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [
          graphReference({ key: 'message', from: ['ai', NodeOutputKeyEnum.errorText] }),
          graphReference({ key: 'stack', from: ['ai', 'stack'] })
        ],
        outputs: ['message', 'stack']
      });
      const { result, responses } = await runGraph({
        nodes: [source, target],
        edges: [graphEdge({ source: 'ai', target: 'target', error: true })]
      });
      expect(graphValues(target)).toEqual({ message: error.message, stack: undefined });
      expect(responses.find((response) => response.nodeId === 'ai')).toMatchObject({
        errorCaptured: true
      });
      expect(result.workflowRuntimeSummary.errorCount).toBe(0);
      expect(Object.hasOwn(result, 'error')).toBe(false);
      expect(requestMock).toHaveBeenCalledOnce();
    }
  );

  it('passes chat answer, reasoning and history to downstream', async () => {
    const keys = [
      NodeOutputKeyEnum.answerText,
      NodeOutputKeyEnum.reasoningText,
      NodeOutputKeyEnum.history
    ];
    const source = graphNode({
      id: 'chat',
      type: FlowNodeTypeEnum.chatNode,
      params: { userChatInput: 'question' },
      outputs: keys,
      isEntry: true
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: keys.map((key) => graphReference({ key, from: ['chat', key] })),
      outputs: keys
    });
    const { result } = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'chat', target: 'target' })]
    });
    expect(graphValues(target)).toMatchObject({ answerText: 'answer', reasoningText: 'reason' });
    expect(graphValues(target).history).toHaveLength(2);
    expect(result.workflowRuntimeSummary.llmInputTokens).toBe(3);
    expect(result.workflowRuntimeSummary.llmOutputTokens).toBe(2);
  });

  it.each(['yes', 'unknown'])(
    'classification forwards its result only through the selected branch: %s',
    async (answerText) => {
      requestMock.mockResolvedValueOnce({
        answerText,
        usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
      });
      const source = graphNode({
        id: 'classify',
        type: FlowNodeTypeEnum.classifyQuestion,
        params: aiCases[1].params,
        outputs: [NodeOutputKeyEnum.cqResult],
        isEntry: true
      });
      const targets = ['yes', 'fallback'].map((id) =>
        graphNode({
          id,
          type: FlowNodeTypeEnum.toolParams,
          inputs: [
            graphReference({
              key: 'classification',
              from: ['classify', NodeOutputKeyEnum.cqResult]
            })
          ],
          outputs: ['classification']
        })
      );
      const { responses } = await runGraph({
        nodes: [source, ...targets],
        edges: targets.map((target) =>
          graphEdge({ source: 'classify', target: target.nodeId, handle: target.nodeId })
        )
      });
      const selected = answerText === 'yes' ? 'yes' : 'fallback';
      expect(
        graphValues(targets.find((target) => target.nodeId === selected)!).classification
      ).toBe(selected);
      expect(
        responses
          .filter((response) => ['yes', 'fallback'].includes(response.nodeId!))
          .map((response) => response.nodeId)
      ).toEqual([selected]);
    }
  );

  it('passes all extracted falsy values and a business error field, excluding undeclared model fields', async () => {
    const fields = { zero: 0, flag: false, nested: { items: [0, false] }, error: 'business field' };
    requestMock.mockResolvedValueOnce({
      answerText: JSON.stringify({ ...fields, undeclared: 'must not pass' }),
      usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
    });
    const keys = [
      ...Object.keys(fields),
      NodeOutputKeyEnum.success,
      NodeOutputKeyEnum.contextExtractFields,
      'undeclared'
    ];
    const source = graphNode({
      id: 'extract',
      type: FlowNodeTypeEnum.contentExtract,
      params: {
        content: 'input',
        extractKeys: Object.keys(fields).map((key) => ({ key, desc: key, required: true }))
      },
      outputs: keys,
      isEntry: true
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: keys.map((key) => graphReference({ key, from: ['extract', key] })),
      outputs: keys
    });
    const { result } = await runGraph({
      nodes: [source, target],
      edges: [graphEdge({ source: 'extract', target: 'target' })]
    });
    expect(graphValues(target)).toMatchObject({ ...fields, success: true, undeclared: undefined });
    expect(JSON.parse(graphValues(target)[NodeOutputKeyEnum.contextExtractFields])).toEqual(fields);
    expect(result.workflowRuntimeSummary.errorCount).toBe(0);
  });
});
