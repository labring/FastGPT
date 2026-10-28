import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { dispatchClassifyQuestion } from '@fastgpt/service/core/workflow/dispatch/ai/classifyQuestion';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: requestMock }));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: async () => ({
    getModelData: () => ({ modelId: 'model', name: 'model', config: {} }),
    getLLMModelData: () => ({ modelId: 'model', name: 'model', config: {} })
  }),
  getTeamModelHandle: async () => ({
    getModelData: () => ({ modelId: 'model', name: 'model', config: {} }),
    getLLMModelData: () => ({ modelId: 'model', name: 'model', config: {} })
  })
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: () => ({ totalPoints: 7 })
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: vi.fn(async () => ({ handle: {}, models: [] })),
  getAuthorizedModelIds: vi.fn(async () => new Set())
}));

describe('dispatchClassifyQuestion token summary', () => {
  it.each([false, true])(
    '用户自带 key=%s 时均统计 token，保留原积分',
    async (usedUserOpenAIKey) => {
      requestMock.mockResolvedValueOnce({
        answerText: 'a',
        usage: { inputTokens: 11, outputTokens: 3, usedUserOpenAIKey }
      });
      const nodeSummary = createNodeSummary();
      const usagePush = vi.fn();
      const result = await dispatchClassifyQuestion({
        runningAppInfo: { id: 'app' },
        runningUserInfo: { teamId: 'team' },
        node: { nodeId: 'classify', name: 'classify' },
        histories: [],
        externalProvider: {},
        params: { userChatInput: 'question', agents: [{ key: 'a', value: 'A' }] },
        nodeSummary,
        usagePush
      } as any);
      expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
        inputTokens: 11,
        outputTokens: 3
      });
      expect(nodeSummary).toMatchObject({ llmInputTokens: 0, llmOutputTokens: 0 });
      expect(usagePush).toHaveBeenCalledWith([
        expect.objectContaining({ totalPoints: usedUserOpenAIKey ? 0 : 7 })
      ]);
    }
  );
});

describe('dispatchClassifyQuestion branch routing', () => {
  it.each([
    ['category-a', 'category-a'],
    ['第二类', 'category-b'],
    ['unknown result', 'category-fallback'],
    ['', 'category-fallback']
  ])('selects only the expected branch for model response %j', async (answerText, selectedKey) => {
    const agents = [
      { key: 'category-a', value: '第一类' },
      { key: 'category-b', value: '第二类' },
      { key: 'category-fallback', value: '其他' }
    ];
    requestMock.mockResolvedValueOnce({
      answerText,
      usage: { inputTokens: 11, outputTokens: 3, usedUserOpenAIKey: false }
    });
    const result = await dispatchClassifyQuestion({
      runningAppInfo: { id: 'app' },
      runningUserInfo: { teamId: 'team' },
      node: { nodeId: 'classify', name: 'classify' },
      histories: [],
      externalProvider: {},
      params: { userChatInput: 'question', agents },
      nodeSummary: createNodeSummary(),
      usagePush: vi.fn()
    } as unknown as Parameters<typeof dispatchClassifyQuestion>[0]);

    const selected = agents.find((agent) => agent.key === selectedKey)!;
    expect(result.data?.[NodeOutputKeyEnum.cqResult]).toBe(selected.value);
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toBe(selected.value);
    expect(result[DispatchNodeResponseKeyEnum.skipHandleId]).toEqual(
      agents
        .filter((agent) => agent.key !== selectedKey)
        .map((agent) => `classify-source-${agent.key}`)
    );
  });
});
