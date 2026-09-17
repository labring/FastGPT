import { describe, expect, it, vi } from 'vitest';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { dispatchChatCompletion } from '@fastgpt/service/core/workflow/dispatch/ai/chat/dispatchChatCompletion';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: requestMock }));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({
    getLLMModelData: () => ({ modelId: 'model', name: 'model', config: { maxResponse: 4096 } })
  })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/chatMessages', () => ({
  getChatMessages: async () => []
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/datasetCite', () => ({
  getDatasetCiteData: async () => ({ userInput: 'question' })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/fileContext', () => ({
  getAIChatFileContextConfig: () => ({}),
  getInputFiles: () => []
}));
vi.mock('@fastgpt/service/core/workflow/utils/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/context')>()),
  getWorkflowFileMaxAmount: () => 20
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: () => ({ totalPoints: 7 })
}));

describe('dispatchChatCompletion token summary', () => {
  it.each(['success', 'empty', 'error'])(
    '保留 %s 返回的模型 usage，计费行为不变',
    async (status) => {
      requestMock.mockResolvedValueOnce({
        completeMessages: [],
        answerText: 'answer',
        finish_reason: 'stop',
        requestId: 'req',
        usage: { inputTokens: 13, outputTokens: 4 },
        ...(status === 'empty' ? { responseEmptyTip: 'empty response' } : {}),
        ...(status === 'error' ? { error: 'LLM failed' } : {})
      });
      const nodeSummary = createNodeSummary();
      const usagePush = vi.fn();
      const result = await dispatchChatCompletion({
        node: { name: 'Chat', inputs: [] },
        histories: [],
        runningUserInfo: { teamId: 'team' },
        externalProvider: {},
        params: { userChatInput: 'question' },
        nodeSummary,
        usagePush
      } as any);
      expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
        inputTokens: 13,
        outputTokens: 4
      });
      expect(nodeSummary).toMatchObject({ llmInputTokens: 0, llmOutputTokens: 0 });
      if (status !== 'success') expect(result.error).toBeDefined();
      if (status === 'empty') expect(usagePush).not.toHaveBeenCalled();
      else
        expect(usagePush).toHaveBeenCalledWith([
          expect.objectContaining({ inputTokens: 13, outputTokens: 4, totalPoints: 7 })
        ]);
    }
  );

  it('请求抛错且没有 usage 时保持零值', async () => {
    requestMock.mockRejectedValueOnce(new Error('network'));
    const nodeSummary = createNodeSummary();
    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question' },
      nodeSummary,
      usagePush: vi.fn()
    } as any);
    expect(result.error).toBeDefined();
    expect(nodeSummary).toMatchObject({ llmInputTokens: 0, llmOutputTokens: 0 });
  });
});
