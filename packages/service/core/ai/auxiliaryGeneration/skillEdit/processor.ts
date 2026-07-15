import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { ChatItemMiniType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/tools';
import { SKILL_EDIT_SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import {
  createAskAgentTool,
  createUpdatePlanTool,
  type AgentLoopToolCatalog
} from '../../llm/agentLoop';
import { runSandboxTools } from '../../sandbox/interface/toolCall';
import {
  getRunningSandboxId,
  type AgentSandboxPrepareAction
} from '../../sandbox/interface/runtime';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../skill/edit/config';
import { concatHistories } from '@fastgpt/global/core/chat/utils';
import {
  runAuxiliaryGenerationAgentLoop,
  type AuxiliaryGenerationProcessorParams,
  type AuxiliaryGenerationProcessorResponse
} from '..';
import { parseUserSystemPrompt } from '../../../workflow/dispatch/ai/agent/adapter/prompt';
import { readFileTool as skillEditReadFilesTool } from '../../../workflow/dispatch/ai/agent/sub/file/utils';
import { createSkillEditAgentLoopAdapter } from './agentLoopAdapter';
import { prepareSkillEditRuntime } from './runtime';
import { runSkillEditReadFiles } from './tools';
import { buildSkillEditUserContext, SKILL_EDIT_MAX_FILES } from './userContext';
import {
  buildSkillEditAgentLoopMemories,
  createSkillEditAskInteractive,
  getSkillEditAgentLoopMemoryKey,
  readSkillEditAgentLoopMemory
} from './utils';

export type SkillEditProcessorData = {
  model: string;
  systemPrompt: string;
  contextMessages: ChatItemMiniType[];
  currentUserValue: UserChatItemType['value'];
  timezone: string;
  userKey?: OpenaiAccountType;
};

type SkillEditProcessorContext = {
  skillId: string;
  responseChatItemId: string;
  isInteractiveResume: boolean;
  hasCurrentFiles: boolean;
  modelCapabilities: {
    vision?: boolean;
    audio?: boolean;
    video?: boolean;
  };
  prepareActions?: AgentSandboxPrepareAction[];
};

type SkillEditProcessorParams = AuxiliaryGenerationProcessorParams<SkillEditProcessorData>;

/**
 * 创建 Skill Edit 调试对话处理器。
 *
 * 工厂只接收当前请求的 Skill、恢复状态和模型能力；返回的处理器负责准备 sandbox、
 * 构造上下文、执行 agent loop 及组装响应，不处理鉴权、聊天轮次和 SSE 生命周期。
 */
export const createSkillEditProcessor = ({
  skillId,
  responseChatItemId,
  isInteractiveResume,
  hasCurrentFiles,
  modelCapabilities,
  prepareActions
}: SkillEditProcessorContext) => {
  return async ({
    query,
    data,
    histories,
    streamWriter,
    requestOrigin,
    maxFiles,
    customPdfParse,
    checkIsStopping,
    usageSink,
    usageId,
    user
  }: SkillEditProcessorParams): Promise<AuxiliaryGenerationProcessorResponse> => {
    const updatePlanTool = createUpdatePlanTool();
    const askTool = createAskAgentTool();
    const runtimeTools = [skillEditReadFilesTool, ...SANDBOX_TOOLS];
    const toolCatalog = {
      runtimeTools,
      updatePlanTool,
      askTool
    } satisfies AgentLoopToolCatalog;
    streamWriter(
      streamSseEvent.sandboxStatus({
        sandboxId: getRunningSandboxId({
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: skillId,
          userId: user.userId,
          chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
        }),
        phase: 'lazyInit'
      })
    );
    const runtime = await prepareSkillEditRuntime({
      skillId,
      userId: user.userId,
      teamId: user.teamId,
      prepareActions
    });
    const userContext = buildSkillEditUserContext({
      histories,
      contextMessages: data.contextMessages,
      currentUserValue: data.currentUserValue,
      currentDataId: responseChatItemId,
      requestOrigin,
      maxFiles: maxFiles ?? SKILL_EDIT_MAX_FILES,
      skillInfos: runtime.skillInfos,
      currentWorkingDirectory: runtime.currentWorkingDirectory,
      currentTime: getSystemTime(data.timezone)
    });
    const adapter = createSkillEditAgentLoopAdapter({
      streamWriter,
      toolCatalog,
      lang: user.lang
    });
    const restoredMemory = readSkillEditAgentLoopMemory({
      histories: concatHistories(histories, data.contextMessages)
    });
    const pendingMainContext = isInteractiveResume ? restoredMemory.pendingMainContext : undefined;
    const formattedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: [data.systemPrompt, SKILL_EDIT_SANDBOX_SYSTEM_PROMPT]
        .filter(Boolean)
        .join('\n\n'),
      resolvePromptToolReferenceName: (id) => {
        const formatId = id.startsWith('t') ? id.slice(1) : id;
        return (
          getSystemToolInfo(id, user.lang)?.name || getSystemToolInfo(formatId, user.lang)?.name
        );
      }
    });

    const loopResult = await runAuxiliaryGenerationAgentLoop({
      teamId: user.teamId,
      userKey: data.userKey,
      model: data.model,
      systemPrompt: formattedSystemPrompt,
      messages: userContext.messages,
      useVision: modelCapabilities.vision,
      useAudio: modelCapabilities.audio,
      useVideo: modelCapabilities.video,
      streamWriter,
      checkIsStopping,
      usageSink,
      toolCatalog,
      pendingMainContext,
      userAnswer: pendingMainContext ? query : undefined,
      resumeMessages:
        pendingMainContext && hasCurrentFiles ? userContext.resumeFileMessages : undefined,
      executeTool: async ({ call }) => {
        const response = await (async () => {
          if (call.function.name === skillEditReadFilesTool.function.name) {
            return runSkillEditReadFiles({
              args: call.function.arguments,
              filesMap: userContext.filesMap,
              teamId: user.teamId,
              tmbId: user.tmbId,
              customPdfParse,
              usageId
            });
          }

          const toolResult = await runSandboxTools({
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId,
            userId: user.userId,
            chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
            toolName: call.function.name,
            args: call.function.arguments,
            sandboxClient: runtime.sandboxClient
          });
          return toolResult.response;
        })();

        return {
          response,
          assistantMessages: [],
          usages: [],
          stop: false
        };
      },
      emitEvent: adapter.emitEvent
    });

    if (loopResult.status === 'ask') {
      if (!loopResult.ask) {
        throw new Error('Skill edit agent loop returned ask status without ask payload.');
      }

      const interactive = createSkillEditAskInteractive({
        planId:
          loopResult.pendingMainContext?.activePlan?.planId || getSkillEditAgentLoopMemoryKey(),
        ask: loopResult.ask,
        usageId
      });
      for (let index = adapter.artifacts.assistantResponses.length - 1; index >= 0; index--) {
        const askValue = adapter.artifacts.assistantResponses[index];
        if (askValue.agentAsk && !askValue.agentAsk.planId) {
          askValue.agentAsk.planId = interactive.planId;
          break;
        }
      }
      adapter.artifacts.assistantResponses.push({ interactive });
      streamWriter(streamSseEvent.interactive(interactive));
    }

    const errorText =
      loopResult.status === 'error'
        ? getErrText(loopResult.error, 'Skill edit agent loop failed')
        : undefined;
    const finalText = loopResult.answerText || errorText;
    // aborted 表示用户或 stop 标记终止本轮，按旧 workflow 行为正常收尾，但不伪造成错误文本。
    if (loopResult.status !== 'aborted' && finalText) {
      adapter.artifacts.assistantResponses.push({
        ...(loopResult.reasoningText
          ? {
              reasoning: {
                content: loopResult.reasoningText
              }
            }
          : {}),
        text: {
          content: finalText
        }
      });
    }

    adapter.artifacts.nodeResponses.forEach((nodeResponse) => {
      streamWriter(streamSseEvent.flowNodeResponse(nodeResponse));
    });

    return {
      aiResponse: adapter.artifacts.assistantResponses,
      nodeResponses: adapter.artifacts.nodeResponses,
      memories: buildSkillEditAgentLoopMemories({
        pendingMainContext: loopResult.status === 'ask' ? loopResult.pendingMainContext : undefined
      })
    };
  };
};
