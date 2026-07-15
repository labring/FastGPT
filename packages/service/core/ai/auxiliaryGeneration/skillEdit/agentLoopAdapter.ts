import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import {
  createAgentLoopCallNodeResponse,
  createAgentLoopEventResponseReducer,
  createAgentLoopMessageCompressNodeResponse,
  createAgentLoopPlanToolNodeResponse,
  createAgentLoopToolNodeResponse,
  createAgentLoopToolResponseCompressNodeResponse,
  type AgentLoopToolCatalog
} from '../../llm/agentLoop';
import type { AuxiliaryGenerationStreamWriter } from '../stream';
import { getSandboxToolInfo } from '../../sandbox/interface/toolCall';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { SKILL_EDIT_AGENT_NODE_ID } from './utils';

const getToolName = (tool?: AgentLoopToolCatalog['runtimeTools'][number]) => tool?.function.name;

/**
 * 将 Skill Edit Agent Loop 适配成 ChatBox 流事件和可持久化运行详情。
 * 工具/计划/追问的聊天状态由共享 reducer 维护，本层只处理 Skill 工具展示和 nodeResponse。
 */
export const createSkillEditAgentLoopAdapter = ({
  streamWriter,
  toolCatalog,
  lang
}: {
  streamWriter?: AuxiliaryGenerationStreamWriter;
  toolCatalog: AgentLoopToolCatalog;
  lang: localeType;
}) => {
  const nodeResponses: ChatHistoryItemResType[] = [];
  const runtimeToolNames = new Set(
    toolCatalog.runtimeTools.map(getToolName).filter((name): name is string => !!name)
  );
  const getToolInfo = (functionName: string) => {
    if (functionName === SubAppIds.readFiles) {
      return {
        name: i18nT('chat:read_file'),
        avatar: '',
        moduleType: FlowNodeTypeEnum.readFiles
      };
    }

    const sandboxToolInfo = getSandboxToolInfo(functionName, lang);
    return {
      name: sandboxToolInfo?.name ?? functionName,
      avatar: sandboxToolInfo?.avatar ?? '',
      moduleType: FlowNodeTypeEnum.tool
    };
  };
  const agentNode = {
    nodeId: SKILL_EDIT_AGENT_NODE_ID,
    moduleType: FlowNodeTypeEnum.agent
  };

  const reducer = createAgentLoopEventResponseReducer({
    updatePlanToolName: toolCatalog.updatePlanTool?.function.name,
    askToolName: toolCatalog.askTool?.function.name,
    isRuntimeTool: (functionName) => runtimeToolNames.has(functionName),
    createRuntimeTool: (event) => {
      const functionName = event.call.function.name;
      const toolInfo = getToolInfo(functionName);
      return {
        id: event.call.id,
        toolName: toolInfo.name,
        toolAvatar: toolInfo.avatar,
        functionName,
        params: event.call.function.arguments ?? ''
      };
    },
    toolResponseMode: 'replace',
    dedupeToolResponses: true,
    callbacks: {
      onAnswerDelta: (event) => {
        streamWriter?.(streamSseEvent.answerDelta(event.text));
      },
      onReasoningDelta: (event) => {
        streamWriter?.(streamSseEvent.reasoningDelta(event.text));
      },
      onLlmRequestStart: (event) => {
        streamWriter?.(streamSseEvent.flowNodeStatus(event.modelName));
      },
      onLlmRequestEnd: (event) => {
        nodeResponses.push(
          createAgentLoopCallNodeResponse({
            event,
            node: agentNode
          })
        );
      },
      onAfterMessageCompress: (event) => {
        nodeResponses.push(
          createAgentLoopMessageCompressNodeResponse({
            event,
            moduleType: FlowNodeTypeEnum.agent
          })
        );
      },
      onRuntimeToolCall: ({ tool }) => {
        streamWriter?.(streamSseEvent.toolCall(tool));
      },
      onRuntimeToolParams: (event) => {
        streamWriter?.(streamSseEvent.toolParams({ id: event.callId, params: event.argsDelta }));
      },
      onRuntimeToolResponse: (event) => {
        const toolNodeResponse = createAgentLoopToolNodeResponse({
          event,
          toolInfo: getToolInfo(event.call.function.name)
        });
        const compressNodeResponse = event.toolResponseCompress
          ? createAgentLoopToolResponseCompressNodeResponse({
              compress: event.toolResponseCompress,
              moduleType: FlowNodeTypeEnum.agent
            })
          : undefined;
        nodeResponses.push({
          ...toolNodeResponse,
          ...(compressNodeResponse ? { childrenResponses: [compressNodeResponse] } : {})
        });
        streamWriter?.(
          streamSseEvent.toolResponse({ id: event.call.id, response: event.response })
        );
      },
      onControlToolResponse: (event) => {
        const nodeResponse = createAgentLoopPlanToolNodeResponse({
          event,
          node: agentNode,
          toolCatalog
        });
        if (nodeResponse) {
          nodeResponses.push(nodeResponse);
        }
      },
      onPlanStatus: (event) => {
        streamWriter?.(streamSseEvent.planStatus({ status: event.status }));
      },
      onPlanUpdate: (event) => {
        streamWriter?.(streamSseEvent.plan(event.plan));
      }
    }
  });

  return {
    artifacts: {
      assistantResponses: reducer.assistantResponses,
      nodeResponses
    },
    emitEvent: reducer.emitEvent
  };
};
