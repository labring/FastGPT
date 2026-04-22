import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchAgentModuleProps } from '..';
import { getExecuteTool, type ToolDispatchContext } from '../utils';

type AgentTool = import('@mariozechner/pi-agent-core').AgentTool<any>;

export async function buildAgentTools({
  ctx,
  nodeResponses,
  usagePush
}: {
  ctx: ToolDispatchContext;
  nodeResponses: ChatHistoryItemResType[];
  usagePush: DispatchAgentModuleProps['usagePush'];
}): Promise<AgentTool[]> {
  const { Type } = await import('@mariozechner/pi-ai');

  const executeTool = getExecuteTool(ctx);
  const tools: AgentTool[] = [];

  for (const tool of ctx.completionTools) {
    const toolId = tool.function.name;

    // pi-agent-core manages multi-turn reasoning; skip the plan tool
    if (toolId === SubAppIds.plan) continue;

    const execute = async (callId: string, args: Record<string, any>, _signal?: AbortSignal) => {
      const argStr = JSON.stringify(args);

      const {
        response,
        usages = [],
        nodeResponse
      } = await executeTool({
        callId,
        toolId,
        args: argStr
      });

      {
        if (nodeResponse) nodeResponses.push(nodeResponse);
        if (usages.length > 0) usagePush(usages);

        ctx.streamResponseFn?.({
          id: callId,
          event: SseResponseEventEnum.toolResponse,
          data: { tool: { response } }
        });
      }

      return { content: [{ type: 'text' as const, text: response }], details: {} };
    };

    // Wrap execute to also emit SSE toolCall event before execution
    const wrappedExecute = async (
      callId: string,
      args: Record<string, any>,
      signal?: AbortSignal
    ) => {
      const subAppInfo = ctx.getSubAppInfo(toolId);
      ctx.streamResponseFn?.({
        id: callId,
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: callId,
            toolName: subAppInfo?.name || toolId,
            toolAvatar: subAppInfo?.avatar || '',
            functionName: toolId,
            params: JSON.stringify(args)
          }
        }
      });
      return execute(callId, args, signal);
    };

    tools.push({
      name: toolId,
      label: tool.function.name,
      description: tool.function.description || '',
      // Convert JSON Schema to TypeBox using Type.Unsafe
      parameters: Type.Unsafe<any>((tool.function.parameters as Record<string, unknown>) ?? {}),
      execute: wrappedExecute
    });
  }

  return tools;
}
