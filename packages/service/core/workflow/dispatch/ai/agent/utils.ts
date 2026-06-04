import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType, ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { AgentLoopProviderName } from '../../../../ai/llm/agentLoop';
import type { AgentAskPayload } from '../../../../ai/llm/agentLoop/systemTools/ask';
import { serviceEnv } from '../../../../../env';
import { buildWorkflowAgentLoopMemories } from './adapter/memory';
import type { SubAppRuntimeType } from './type';

export type FastAgentProviderState = {
  pendingMainContext?: {
    askToolCallId?: string;
    activePlan?: {
      planId?: string;
    };
  };
};

export type PiAgentProviderState = {
  piMessages?: unknown[];
  activePlan?: {
    planId?: string;
  };
  pendingAsk?: AgentAskPayload;
  pendingAskId?: string;
};

/**
 * 解析本次 workflow agent 应使用的 agentLoop provider。
 * 业务层只关心 provider 名称，不直接判断具体实现入口。
 */
export const getWorkflowAgentLoopProvider = (): AgentLoopProviderName =>
  serviceEnv.AGENT_ENGINE === 'piAgent' ? 'piAgent' : 'fastAgent';

/**
 * 读取 fastAgent 私有状态。
 * providerState 来自持久化 memory，进入业务层时必须先按 provider 做窄化。
 */
export const readFastAgentProviderState = (providerState: unknown): FastAgentProviderState => {
  if (!providerState || typeof providerState !== 'object') return {};
  return providerState as FastAgentProviderState;
};

/**
 * 读取 piAgent 私有状态。
 * piMessages 仍是 piAgent 过渡期上下文恢复字段，不参与通用 agent-loop transcript。
 */
export const readPiAgentProviderState = (providerState: unknown): PiAgentProviderState => {
  if (!providerState || typeof providerState !== 'object') return {};
  return providerState as PiAgentProviderState;
};

/**
 * piAgent 的完整 raw messages 单独写入历史 memory。
 * providerState 内只保留 pendingAsk、activePlan 这类轻量恢复状态，避免重复嵌套完整 transcript。
 */
export const getPiAgentMemoryProviderState = (providerState: unknown) => {
  const state = readPiAgentProviderState(providerState);
  const { piMessages: _piMessages, ...memoryState } = state;
  return Object.keys(memoryState).length > 0 ? memoryState : undefined;
};

export const getPiMessagesMemoryKey = (nodeId: string) => `piMessages-${nodeId}`;

/**
 * 创建 Agent 工具展示信息查询器。
 * 用户选择的子应用和 provider 注入的内置工具来源不同，workflow 运行详情只消费统一后的 name/avatar/description。
 */
export const createAgentSubAppLookup = ({
  subAppsMap,
  lang
}: {
  subAppsMap: Map<string, SubAppRuntimeType>;
  lang?: localeType;
}) => {
  const normalizeToolId = (id: string) => (id.startsWith('t') ? id.slice(1) : id);

  return {
    getSubAppInfo: (id: string) => {
      const formatId = normalizeToolId(id);
      const userToolNode = subAppsMap.get(id) || subAppsMap.get(formatId);
      if (userToolNode) {
        return {
          name: userToolNode.name || '',
          avatar: userToolNode.avatar || '',
          toolDescription: userToolNode.toolDescription || userToolNode.name || ''
        };
      }

      const systemToolNode = getSystemToolInfo(id, lang) || getSystemToolInfo(formatId, lang);
      return {
        name: systemToolNode?.name || '',
        avatar: systemToolNode?.avatar || '',
        toolDescription: systemToolNode?.toolDescription || systemToolNode?.name || ''
      };
    },
    getSubApp: (id: string) => {
      const formatId = normalizeToolId(id);
      return subAppsMap.get(id) || subAppsMap.get(formatId);
    }
  };
};

/**
 * 计算本轮 agentLoop 调用需要传入的 providerState 和是否是 ask_user 恢复。
 * fastAgent 直接使用统一 memory；piAgent 兼容从旧 piMessages key 恢复 raw messages。
 */
export const prepareAgentLoopProviderRunState = ({
  provider,
  restoredProviderState,
  histories,
  nodeId,
  hasLastInteractive
}: {
  provider: AgentLoopProviderName;
  restoredProviderState: unknown;
  histories: ChatItemMiniType[];
  nodeId: string;
  hasLastInteractive: boolean;
}) => {
  const piMessagesKey = getPiMessagesMemoryKey(nodeId);
  const lastHistory = histories[histories.length - 1];
  const fastAgentProviderState = readFastAgentProviderState(restoredProviderState);
  const restoredPiProviderState = readPiAgentProviderState(restoredProviderState);
  const piAgentProviderState: PiAgentProviderState = {
    ...restoredPiProviderState,
    ...(provider === 'piAgent' && lastHistory?.obj === ChatRoleEnum.AI
      ? {
          piMessages:
            restoredPiProviderState.piMessages ||
            (lastHistory.memories?.[piMessagesKey] as unknown[] | undefined)
        }
      : {})
  };

  return {
    piMessagesKey,
    providerState: provider === 'piAgent' ? piAgentProviderState : restoredProviderState,
    isAskResume:
      hasLastInteractive &&
      (provider === 'piAgent'
        ? !!restoredPiProviderState.pendingAsk
        : !!fastAgentProviderState.pendingMainContext)
  };
};

/**
 * 将主 loop 的 ask_user 追问转换成 workflow interactive 响应，交给前端展示并等待用户回答。
 */
export const createAskInteractive = ({
  askId,
  ask
}: {
  askId: string;
  ask: AgentAskPayload;
}): InteractiveNodeResponseType => ({
  type: 'agentPlanAskQuery',
  askId,
  params: {
    content: ask.question,
    reason: ask.reason,
    blockerType: ask.blockerType,
    options: ask.options
  }
});

/**
 * ask_user 需要绑定 askId，方便 saveChat 把用户回答标记为 UI-only answer。
 */
export const getAskInteractiveAskId = ({
  provider,
  providerState,
  nodeId,
  fallbackMemoryKey
}: {
  provider: AgentLoopProviderName;
  providerState: unknown;
  nodeId: string;
  fallbackMemoryKey: string;
}) => {
  const fastAgentProviderState = readFastAgentProviderState(providerState);
  const piAgentProviderState = readPiAgentProviderState(providerState);

  return (
    (provider === 'piAgent'
      ? piAgentProviderState.pendingAskId
      : fastAgentProviderState.pendingMainContext?.askToolCallId) ||
    fallbackMemoryKey ||
    nodeId
  );
};

/**
 * 事件流可能先写入 agentAsk 卡片；ask interactive 创建后补齐对应 askId。
 */
export const appendAskIdToAssistantResponses = ({
  assistantResponses,
  askId
}: {
  assistantResponses: AIChatItemValueItemType[];
  askId: string;
}) => {
  for (let index = assistantResponses.length - 1; index >= 0; index--) {
    const askValue = assistantResponses[index];
    if (askValue.agentAsk && !askValue.agentAsk.askId) {
      askValue.agentAsk.askId = askId;
      break;
    }
  }
};

/**
 * 合并 provider 额外返回的 assistantResponses。
 * 按 id 去重，避免事件流已写入的内容被最终结果重复追加。
 */
export const appendResultAssistantResponses = ({
  target,
  values
}: {
  target: AIChatItemValueItemType[];
  values?: AIChatItemValueItemType[];
}) => {
  if (!values?.length) return;

  const existingIds = new Set(target.map((item) => item.id).filter(Boolean));
  for (const value of values) {
    if (value.id && existingIds.has(value.id)) continue;
    target.push(value);
    if (value.id) existingIds.add(value.id);
  }
};

/**
 * 从结构化 assistantResponses 中提取最终文本输出。
 * workflow output 只需要纯文本，但聊天记录仍保留结构化内容。
 */
export const getPersistedTextOutput = (assistantResponses: AIChatItemValueItemType[]) =>
  assistantResponses
    .filter((item) => item.text?.content)
    .map((item) => item.text!.content)
    .join('');

/**
 * 将最终文本追加到 assistantResponses。
 * 若事件流已经持久化相同文本，只追加缺失部分，避免刷新后重复显示。
 */
export const appendFinalAssistantResponse = ({
  assistantResponses,
  finalText,
  reasoningText,
  hideReason
}: {
  assistantResponses: AIChatItemValueItemType[];
  finalText?: string;
  reasoningText?: string;
  hideReason?: boolean;
}) => {
  if (!finalText) return;

  const persistedText = getPersistedTextOutput(assistantResponses);
  if (finalText === persistedText || persistedText.endsWith(finalText)) return;

  assistantResponses.push({
    ...(reasoningText
      ? {
          reasoning: {
            content: reasoningText
          },
          ...(hideReason ? { hideReason: true } : {})
        }
      : {}),
    text: {
      content: finalText.startsWith(persistedText)
        ? finalText.slice(persistedText.length)
        : finalText
    }
  });
};

/**
 * ask 暂停态 memory：fastAgent 保存完整 providerState；piAgent 额外把 raw messages 写回旧 key。
 */
export const buildAgentLoopAskMemories = ({
  provider,
  nodeId,
  providerState,
  piMessagesKey
}: {
  provider: AgentLoopProviderName;
  nodeId: string;
  providerState: unknown;
  piMessagesKey: string;
}) => {
  if (provider !== 'piAgent') {
    return buildWorkflowAgentLoopMemories({
      nodeId,
      memory: {
        providerState
      }
    });
  }

  return {
    ...buildWorkflowAgentLoopMemories({
      nodeId,
      memory: {
        providerState: getPiAgentMemoryProviderState(providerState)
      }
    }),
    [piMessagesKey]: readPiAgentProviderState(providerState).piMessages
  };
};

/**
 * 完成态 memory：清理统一 providerState；piAgent 继续保留 raw messages 供下一轮兼容恢复。
 */
export const buildAgentLoopDoneMemories = ({
  provider,
  nodeId,
  providerState,
  piMessagesKey
}: {
  provider: AgentLoopProviderName;
  nodeId: string;
  providerState: unknown;
  piMessagesKey: string;
}) => {
  if (provider !== 'piAgent') {
    return buildWorkflowAgentLoopMemories({
      nodeId,
      memory: {}
    });
  }

  return {
    ...buildWorkflowAgentLoopMemories({
      nodeId,
      memory: {}
    }),
    [piMessagesKey]: readPiAgentProviderState(providerState).piMessages
  };
};
