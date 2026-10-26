import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchRunTools } from '@fastgpt/service/core/workflow/dispatch/ai/tool';
import type { DispatchToolModuleProps } from '@fastgpt/service/core/workflow/dispatch/ai/tool/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runToolCallMock } = vi.hoisted(() => ({ runToolCallMock: vi.fn() }));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/tool/toolCall', () => ({
  runToolCall: runToolCallMock
}));

const createProps = () =>
  ({
    node: {
      nodeId: 'agent',
      name: 'Tool call',
      flowNodeType: FlowNodeTypeEnum.agent,
      isEntry: true,
      inputs: []
    },
    runtimeNodes: [],
    runtimeEdges: [],
    histories: [],
    query: [],
    chatConfig: {},
    runningAppInfo: { id: 'app_1' },
    runningUserInfo: {},
    externalProvider: {},
    params: {
      model: 'gpt-5',
      systemPrompt: '',
      userChatInput: 'question',
      isResponseAnswerText: true
    }
  }) as unknown as DispatchToolModuleProps;

describe('dispatchRunTools complete tool responses', () => {
  beforeEach(() => {
    runToolCallMock.mockReset();
  });

  it.each([
    { name: 'success', runtimeResult: {} },
    { name: 'model error', runtimeResult: { error: 'model failed after tool execution' } },
    {
      name: 'interactive pause',
      runtimeResult: {
        toolWorkflowInteractiveResponse: { type: 'toolChildrenInteractive', params: {} }
      }
    }
  ])('keeps the complete tool result on $name', async ({ runtimeResult }) => {
    const response = `${'a'.repeat(6000)}important middle content${'z'.repeat(6000)}`;
    const assistantResponses: AIChatItemValueItemType[] = [
      {
        type: ChatItemValueTypeEnum.tool,
        tools: [
          {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: '',
            functionName: 'search',
            params: '{}',
            response
          }
        ]
      },
      { type: ChatItemValueTypeEnum.text, text: { content: 'answer' } }
    ];
    runToolCallMock.mockResolvedValueOnce({
      toolDispatchFlowResponses: [],
      toolCallInputTokens: 0,
      toolCallOutputTokens: 0,
      completeMessages: [],
      finish_reason: 'stop',
      assistantResponses,
      ...runtimeResult
    });

    const result = await dispatchRunTools(createProps());

    expect(result.assistantResponses).toEqual(assistantResponses);
  });
});
