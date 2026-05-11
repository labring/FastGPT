import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchAgentModuleProps } from '..';
import { getExecuteTool, type ToolDispatchContext } from '../utils';

type AgentTool = import('@mariozechner/pi-agent-core').AgentTool<any>;

export async function buildAgentTools({
  ctx,
  assistantResponses,
  appendChildNodeResponse,
  usagePush
}: {
  ctx: ToolDispatchContext;
  assistantResponses: AIChatItemValueItemType[];
  appendChildNodeResponse: (nodeResponse: ChatHistoryItemResType) => void;
  usagePush: DispatchAgentModuleProps['usagePush'];
}): Promise<AgentTool[]> {
  const { Type } = await import('@mariozechner/pi-ai');

  const executeTool = getExecuteTool(ctx);
  const tools: AgentTool[] = [];

  const replaceOrAppendTool = (
    toolList: ToolModuleResponseItemType[] | null | undefined,
    tool: ToolModuleResponseItemType
  ) => {
    if (!toolList?.length) return [tool];

    const hasTool = toolList.some((item) => item.id === tool.id);
    return hasTool
      ? toolList.map((item) => (item.id === tool.id ? tool : item))
      : toolList.concat(tool);
  };

  const findToolResponseIndex = (callId: string) =>
    assistantResponses.findIndex((item) => item.tools?.some((tool) => tool.id === callId));

  const upsertAssistantTool = (tool: ToolModuleResponseItemType) => {
    const responseIndex = findToolResponseIndex(tool.id);
    if (responseIndex < 0) {
      assistantResponses.push({
        id: tool.id,
        tools: [tool]
      });
      return;
    }

    const currentValue = assistantResponses[responseIndex];
    assistantResponses[responseIndex] = {
      ...currentValue,
      tools: replaceOrAppendTool(currentValue.tools, tool)
    };
  };

  const appendAssistantToolResponse = (callId: string, response: string) => {
    const responseIndex = findToolResponseIndex(callId);
    if (responseIndex < 0) return;

    const currentValue = assistantResponses[responseIndex];
    const currentTool = currentValue.tools?.find((tool) => tool.id === callId);
    if (!currentTool) return;

    const nextTool = {
      ...currentTool,
      response: `${currentTool.response || ''}${response}`
    };
    assistantResponses[responseIndex] = {
      ...currentValue,
      tools: replaceOrAppendTool(currentValue.tools, nextTool)
    };
  };

  for (const tool of ctx.completionTools) {
    const toolId = tool.function.name;

    const execute = async (callId: string, args: Record<string, any>) => {
      const argStr = JSON.stringify(args);

      const {
        response,
        usages = [],
        nodeResponse,
        capabilityAssistantResponses = []
      } = await executeTool({
        callId,
        toolId,
        args: argStr
      });

      if (nodeResponse) appendChildNodeResponse(nodeResponse);
      if (usages.length > 0) usagePush(usages);
      if (capabilityAssistantResponses.length > 0) {
        assistantResponses.push(...capabilityAssistantResponses);
      }
      appendAssistantToolResponse(callId, response);

      ctx.streamResponseFn?.({
        id: callId,
        event: SseResponseEventEnum.toolResponse,
        data: { tool: { response } }
      });

      return { content: [{ type: 'text' as const, text: response }], details: {} };
    };

    // Wrap execute to also emit SSE toolCall event before execution.
    const wrappedExecute = async (callId: string, args: Record<string, any>) => {
      const subAppInfo = ctx.getSubAppInfo(toolId);
      const assistantTool: ToolModuleResponseItemType = {
        id: callId,
        toolName: subAppInfo?.name || toolId,
        toolAvatar: subAppInfo?.avatar || '',
        functionName: toolId,
        params: JSON.stringify(args)
      };
      upsertAssistantTool(assistantTool);

      ctx.streamResponseFn?.({
        id: callId,
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: assistantTool
        }
      });
      return execute(callId, args);
    };

    tools.push({
      name: toolId,
      label: tool.function.name,
      description: tool.function.description || '',
      parameters: Type.Unsafe<any>((tool.function.parameters as Record<string, unknown>) ?? {}),
      execute: wrappedExecute
    });
  }

  return tools;
}
