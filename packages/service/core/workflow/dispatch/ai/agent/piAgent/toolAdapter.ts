import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { DispatchAgentModuleProps } from '..';
import { getExecuteTool, type ToolDispatchContext } from '../utils';
import { parseJsonArgs } from '../../../../../ai/utils';

type AgentTool = import('@mariozechner/pi-agent-core').AgentTool<any>;
type AgentEvent = import('@mariozechner/pi-agent-core').AgentEvent;

const stringifyToolArgs = (args: unknown) => {
  try {
    const result = JSON.stringify(args ?? {});
    return typeof result === 'string' ? result : '{}';
  } catch {
    return '{}';
  }
};

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

const findToolResponseIndex = (assistantResponses: AIChatItemValueItemType[], callId: string) =>
  assistantResponses.findIndex((item) => item.tools?.some((tool) => tool.id === callId));

const findAssistantTool = (assistantResponses: AIChatItemValueItemType[], callId: string) => {
  const responseIndex = findToolResponseIndex(assistantResponses, callId);
  if (responseIndex < 0) return;
  return assistantResponses[responseIndex].tools?.find((tool) => tool.id === callId);
};

const upsertAssistantTool = (
  assistantResponses: AIChatItemValueItemType[],
  tool: ToolModuleResponseItemType
) => {
  const responseIndex = findToolResponseIndex(assistantResponses, tool.id);
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

const updateAssistantTool = (
  assistantResponses: AIChatItemValueItemType[],
  callId: string,
  updater: (tool: ToolModuleResponseItemType) => ToolModuleResponseItemType
) => {
  const responseIndex = findToolResponseIndex(assistantResponses, callId);
  if (responseIndex < 0) return;

  const currentValue = assistantResponses[responseIndex];
  const currentTool = currentValue.tools?.find((tool) => tool.id === callId);
  if (!currentTool) return;

  const nextTool = updater(currentTool);
  assistantResponses[responseIndex] = {
    ...currentValue,
    tools: replaceOrAppendTool(currentValue.tools, nextTool)
  };
};

const appendAssistantToolResponse = (
  assistantResponses: AIChatItemValueItemType[],
  callId: string,
  response: string
) => {
  updateAssistantTool(assistantResponses, callId, (tool) => ({
    ...tool,
    response: `${tool.response || ''}${response}`
  }));
};

const appendAssistantToolParams = (
  assistantResponses: AIChatItemValueItemType[],
  callId: string,
  params: string
) => {
  updateAssistantTool(assistantResponses, callId, (tool) => ({
    ...tool,
    params: `${tool.params || ''}${params}`
  }));
};

const getUsageTotalPoints = (usages: Array<{ totalPoints?: number }> = []) =>
  usages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

const getToolResultText = (result: unknown) => {
  const content = (result as { content?: Array<{ type?: string; text?: string }> } | undefined)
    ?.content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (item?.type === 'text') return item.text || '';
      if (item?.type === 'image') return '[image]';
      return '';
    })
    .join('');
};

export const createPiAgentToolEventHandler = ({
  ctx,
  assistantResponses,
  appendChildNodeResponse,
  nodeResponses
}: {
  ctx: ToolDispatchContext;
  assistantResponses: AIChatItemValueItemType[];
  appendChildNodeResponse: (nodeResponse: ChatHistoryItemResType) => void;
  nodeResponses: ChatHistoryItemResType[];
}) => {
  const toolStarts = new Map<
    string,
    {
      toolName: string;
      args: Record<string, any>;
      argStr: string;
      startTime: number;
    }
  >();

  const ensureToolCallCard = ({
    callId,
    toolName,
    args
  }: {
    callId: string;
    toolName: string;
    args: Record<string, any>;
  }) => {
    if (!callId) return;

    const argStr = stringifyToolArgs(args);
    const subAppInfo = ctx.getSubAppInfo(toolName);
    const currentTool = findAssistantTool(assistantResponses, callId);

    if (!currentTool) {
      const assistantTool: ToolModuleResponseItemType = {
        id: callId,
        toolName: subAppInfo?.name || toolName,
        toolAvatar: subAppInfo?.avatar || '',
        functionName: toolName,
        params: ''
      };
      upsertAssistantTool(assistantResponses, assistantTool);

      ctx.streamResponseFn?.({
        id: callId,
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: assistantTool
        }
      });
    }

    const latestTool = findAssistantTool(assistantResponses, callId);
    if (argStr && !latestTool?.params) {
      appendAssistantToolParams(assistantResponses, callId, argStr);
      ctx.streamResponseFn?.({
        id: callId,
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            id: callId,
            params: argStr
          }
        }
      });
    }
  };

  const appendFallbackErrorNodeResponse = ({
    callId,
    toolName,
    response
  }: {
    callId: string;
    toolName: string;
    response: string;
  }) => {
    if (!callId || nodeResponses.some((item) => item.id === callId || item.nodeId === callId)) {
      return;
    }

    const started = toolStarts.get(callId);
    const subAppInfo = ctx.getSubAppInfo(toolName);
    appendChildNodeResponse({
      id: callId,
      nodeId: callId,
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: subAppInfo?.name || toolName,
      moduleLogo: subAppInfo?.avatar || '',
      toolInput: parseJsonArgs(started?.argStr || '{}') || undefined,
      toolRes: response,
      errorText: response,
      runningTime: started ? +((Date.now() - started.startTime) / 1000).toFixed(2) : undefined,
      totalPoints: 0
    });
  };

  return (event: AgentEvent) => {
    if (event.type === 'tool_execution_start') {
      const args = event.args && typeof event.args === 'object' ? event.args : {};
      const argStr = stringifyToolArgs(args);
      toolStarts.set(event.toolCallId, {
        toolName: event.toolName,
        args,
        argStr,
        startTime: Date.now()
      });
      ensureToolCallCard({
        callId: event.toolCallId,
        toolName: event.toolName,
        args
      });
      return;
    }

    if (event.type === 'tool_execution_end') {
      const started = toolStarts.get(event.toolCallId);
      ensureToolCallCard({
        callId: event.toolCallId,
        toolName: event.toolName || started?.toolName || '',
        args: started?.args || {}
      });

      const response =
        getToolResultText(event.result) || (event.isError ? 'Tool execution failed' : '');
      const currentTool = findAssistantTool(assistantResponses, event.toolCallId);
      if (response && !currentTool?.response) {
        appendAssistantToolResponse(assistantResponses, event.toolCallId, response);
        ctx.streamResponseFn?.({
          id: event.toolCallId,
          event: SseResponseEventEnum.toolResponse,
          data: {
            tool: {
              id: event.toolCallId,
              response
            }
          }
        });
      }

      if (event.isError) {
        appendFallbackErrorNodeResponse({
          callId: event.toolCallId,
          toolName: event.toolName || started?.toolName || '',
          response
        });
      }

      toolStarts.delete(event.toolCallId);
    }
  };
};

export async function buildAgentTools({
  ctx,
  assistantResponses,
  appendChildNodeResponse,
  usagePush,
  executeToolFactory = getExecuteTool
}: {
  ctx: ToolDispatchContext;
  assistantResponses: AIChatItemValueItemType[];
  appendChildNodeResponse: (nodeResponse: ChatHistoryItemResType) => void;
  usagePush: DispatchAgentModuleProps['usagePush'];
  executeToolFactory?: typeof getExecuteTool;
}): Promise<AgentTool[]> {
  const { Type } = await import('@mariozechner/pi-ai');

  const executeTool = executeToolFactory(ctx);
  const tools: AgentTool[] = [];

  for (const tool of ctx.completionTools) {
    const toolId = tool.function.name;

    const execute = async (callId: string, args: Record<string, any>, argStr: string) => {
      const startTime = Date.now();

      const {
        response,
        usages = [],
        nodeResponse
      } = await executeTool({
        callId,
        toolId,
        args: argStr
      });

      const toolNodeResponse =
        nodeResponse ||
        (() => {
          const subAppInfo = ctx.getSubAppInfo(toolId);
          return {
            id: callId,
            nodeId: callId,
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: subAppInfo?.name || toolId,
            moduleLogo: subAppInfo?.avatar || '',
            toolInput: parseJsonArgs(argStr) || undefined,
            toolRes: response,
            runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
            totalPoints: getUsageTotalPoints(usages)
          };
        })();
      appendChildNodeResponse(toolNodeResponse);
      if (usages.length > 0) usagePush(usages);
      appendAssistantToolResponse(assistantResponses, callId, response);

      ctx.streamResponseFn?.({
        id: callId,
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            id: callId,
            response
          }
        }
      });

      return { content: [{ type: 'text' as const, text: response }], details: {} };
    };

    // Wrap execute to also emit SSE toolCall event before execution.
    const wrappedExecute = async (callId: string, args: Record<string, any>) => {
      const argStr = stringifyToolArgs(args);
      const subAppInfo = ctx.getSubAppInfo(toolId);
      if (!findAssistantTool(assistantResponses, callId)) {
        const assistantTool: ToolModuleResponseItemType = {
          id: callId,
          toolName: subAppInfo?.name || toolId,
          toolAvatar: subAppInfo?.avatar || '',
          functionName: toolId,
          params: ''
        };
        upsertAssistantTool(assistantResponses, assistantTool);

        ctx.streamResponseFn?.({
          id: callId,
          event: SseResponseEventEnum.toolCall,
          data: {
            tool: assistantTool
          }
        });
      }

      if (argStr && !findAssistantTool(assistantResponses, callId)?.params) {
        appendAssistantToolParams(assistantResponses, callId, argStr);
        ctx.streamResponseFn?.({
          id: callId,
          event: SseResponseEventEnum.toolParams,
          data: {
            tool: {
              id: callId,
              params: argStr
            }
          }
        });
      }

      return execute(callId, args, argStr);
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
