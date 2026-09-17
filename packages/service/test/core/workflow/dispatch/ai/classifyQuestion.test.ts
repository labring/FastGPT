import { describe, expect, it, vi } from 'vitest';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { dispatchClassifyQuestion } from '@fastgpt/service/core/workflow/dispatch/ai/classifyQuestion';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: requestMock }));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({
    getLLMModelData: () => ({ modelId: 'model', name: 'model', config: {} })
  })
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: () => ({ totalPoints: 7 })
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
