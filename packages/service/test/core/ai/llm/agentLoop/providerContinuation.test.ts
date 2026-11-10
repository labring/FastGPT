import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopEvent } from '@fastgpt/service/core/ai/llm/agentLoop/domain/event';
import { runAgentLoopCoreWithSummary } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/run';
import { mockCreateLLMResponseQueue, text, toolCall } from './_mocks/llmQueue';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mocks.request
}));
vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: vi.fn(async ({ messages }) => ({ messages })),
  compressToolResponse: vi.fn(async ({ response }) => ({ compressed: response }))
}));

const model: LLMModelDataType = {
  provider: 'openai',
  model: 'continuation-test',
  modelId: '68ad85a7463006c963799a05',
  name: 'Continuation test',
  scope: ModelScopeEnum.system,
  type: ModelTypeEnum.llm,
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 4096,
    functionCall: true,
    toolChoice: true
  }
};
const continuation = 'INTERNAL_CONTINUATION_AFTER_TOOL';

describe.each(['fastAgent', 'piAgent'] as const)(
  'continuation through the real %s Core and Provider',
  (provider) => {
    const mainLLM = vi.fn();
    let requestMessages: ChatCompletionMessageParam[][];

    beforeEach(() => {
      vi.clearAllMocks();
      // 冻结取消轮询，确保取消只在写入边界被同步检测，不靠 200ms 定时器偶然触发。
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      requestMessages = [];
      mocks.request.mockImplementation(
        (args: { body: { messages: ChatCompletionMessageParam[] } }) => {
          requestMessages.push(structuredClone(args.body.messages));
          return mainLLM(args);
        }
      );
      if (provider === 'piAgent') {
        // 保留真实 pi-agent-core 和 Provider，只替换模型的 HTTP 响应。
        vi.stubGlobal('fetch', async (_input: unknown, init: RequestInit) => {
          const response = await mocks.request({ body: JSON.parse(init.body as string) });
          const chunk = {
            id: response.requestId,
            object: 'chat.completion.chunk',
            created: 1,
            model: model.model,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: response.answerText,
                  ...(response.toolCalls?.length && {
                    tool_calls: response.toolCalls.map(
                      (call: ChatCompletionMessageToolCall, index: number) => ({ ...call, index })
                    )
                  })
                },
                finish_reason: response.finish_reason
              }
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          };
          return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
            headers: { 'content-type': 'text/event-stream' }
          });
        });
      }
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    /** 在真实工具返回前改变停止事实，同时检查模型请求、标准历史和可持久化展示事件。 */
    const run = async ({
      cancelled = false,
      withContinuation = true,
      cancelDuringCompletion = false
    }: {
      cancelled?: boolean;
      withContinuation?: boolean;
      cancelDuringCompletion?: boolean;
    } = {}) => {
      let stopping = false;
      const events: AgentLoopEvent[] = [];
      mockCreateLLMResponseQueue(mainLLM, [
        ...(cancelDuringCompletion ? [] : [toolCall({ name: 'review_tool' })]),
        text({ content: 'Tool completed.' })
      ]);
      const output = await runAgentLoopCoreWithSummary({
        provider,
        input: { messages: [{ role: 'user', content: 'Review the draft.' }] },
        runtime: {
          teamId: 'team',
          llmParams: { model, userKey: { key: 'test-key', baseUrl: 'https://llm.test/v1' } },
          toolCatalog: {
            runtimeTools: [
              {
                type: 'function',
                function: { name: 'review_tool', parameters: { type: 'object', properties: {} } }
              }
            ]
          },
          checkIsStopping: () => stopping,
          ...(cancelDuringCompletion && {
            completionPolicy: async () => {
              await Promise.resolve();
              stopping = true;
              return { action: 'continue' as const, message: continuation };
            }
          }),
          executeTool: async () => {
            stopping = cancelled;
            return {
              response: 'Tool completed.',
              assistantMessages: [],
              usages: [],
              ...(withContinuation && { continuationMessage: continuation })
            };
          },
          emitEvent: (event) => {
            events.push(event);
          }
        }
      });
      return { ...output, events };
    };

    it.each([true, false])(
      'does not persist, emit or send a continuation after cancellation; tool includes continuation=%s',
      async (withContinuation) => {
        const { result, summary, events } = await run({ cancelled: true, withContinuation });
        expect(result.status).toBe('aborted');
        expect(JSON.stringify(result.completeMessages)).not.toContain(continuation);
        expect(JSON.stringify(result.assistantMessages)).not.toContain(continuation);
        expect(JSON.stringify({ providerState: result.providerState })).not.toContain(continuation);
        expect(summary.assistantResponses.filter((value) => value.userMessage)).toHaveLength(0);
        expect(events.filter((event) => event.type === 'user_message')).toHaveLength(0);
        expect(requestMessages.length).toBeGreaterThan(0);
        expect(JSON.stringify(requestMessages)).not.toContain(continuation);
      }
    );

    it('does not append a completion continuation when cancellation takes effect during the awaited policy', async () => {
      const { result, summary, events } = await run({ cancelDuringCompletion: true });
      expect(result.status).toBe('aborted');
      expect(JSON.stringify(result.completeMessages)).not.toContain(continuation);
      expect(summary.assistantResponses.filter((value) => value.userMessage)).toHaveLength(0);
      expect(events.filter((event) => event.type === 'user_message')).toHaveLength(0);
      expect(requestMessages).toHaveLength(1);
    });

    it('keeps one continuation in the original context when the tool is allowed to continue', async () => {
      const { result, summary, events } = await run();
      expect(result.status).toBe('done');
      expect(result.completeMessages).toContainEqual({
        role: 'user',
        content: continuation,
        hideInUI: true
      });
      expect(summary.assistantResponses.filter((value) => value.userMessage)).toEqual([
        { userMessage: { content: continuation, source: 'server' }, hideInUI: true }
      ]);
      expect(events.filter((event) => event.type === 'user_message')).toEqual([
        { type: 'user_message', content: continuation, source: 'server' }
      ]);
      expect(requestMessages).toHaveLength(2);
      expect(JSON.stringify(requestMessages[1])).toContain(continuation);
    });
  }
);
