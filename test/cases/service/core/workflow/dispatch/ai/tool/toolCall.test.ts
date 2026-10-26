import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { runToolCall } from '@fastgpt/service/core/workflow/dispatch/ai/tool/toolCall';
import type { DispatchToolModuleProps } from '@fastgpt/service/core/workflow/dispatch/ai/tool/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runAgentCallMock, runWorkflowMock } = vi.hoisted(() => ({
  runAgentCallMock: vi.fn(),
  runWorkflowMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentCall', () => ({ runAgentCall: runAgentCallMock }));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ runWorkflow: runWorkflowMock }));

describe('runToolCall complete SSE responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([false, true])(
    'keeps the model and SSE results complete when resuming=%s',
    async (resume) => {
      const response = `${'a'.repeat(6000)}important middle content${'z'.repeat(6000)}`;
      const call = {
        id: 'call_search',
        type: 'function' as const,
        function: { name: 'search', arguments: '{}' }
      };
      const workflowStreamResponse = vi.fn();
      runWorkflowMock.mockResolvedValue({
        toolResponses: response,
        assistantResponses: [],
        flowUsages: [],
        flowResponses: []
      });
      runAgentCallMock.mockImplementationOnce(async (options) => {
        const result = resume
          ? await options.handleInteractiveTool({
              childrenResponse: { entryNodeIds: ['search'] },
              toolParams: { toolCallId: call.id }
            })
          : await options.handleToolResponse({ call, messages: [] });
        expect(result.response).toBe(response);

        return {
          inputTokens: 0,
          outputTokens: 0,
          completeMessages: [],
          assistantMessages: [
            { role: ChatCompletionRequestMessageRoleEnum.Assistant, tool_calls: [call] },
            {
              role: ChatCompletionRequestMessageRoleEnum.Tool,
              tool_call_id: call.id,
              content: result.response
            }
          ],
          finish_reason: 'stop'
        };
      });
      const toolNode = {
        nodeId: 'search',
        name: 'Search',
        flowNodeType: FlowNodeTypeEnum.tool,
        inputs: [],
        toolParams: []
      };

      const result = await runToolCall({
        messages: [],
        toolNodes: [toolNode],
        toolModel: { model: 'gpt-5' },
        runtimeNodes: [toolNode],
        runtimeEdges: [],
        externalProvider: {},
        workflowStreamResponse,
        params: { isResponseAnswerText: true }
      } as unknown as DispatchToolModuleProps);

      expect(result.assistantResponses.flatMap((item) => item.tools ?? [])).toEqual([
        expect.objectContaining({ id: call.id, response })
      ]);
      expect(workflowStreamResponse).toHaveBeenCalledWith({
        event: SseResponseEventEnum.toolResponse,
        data: { tool: { id: call.id, toolName: '', toolAvatar: '', params: '', response } }
      });
    }
  );
});
