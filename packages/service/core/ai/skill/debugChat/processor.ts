import { getErrText } from '@fastgpt/global/common/error/utils';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { SKILL_EDIT_SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { runAgentLoop } from '../../llm/agentLoop/interface';
import type {
  AuxiliaryGenerationProcessorParams,
  AuxiliaryGenerationProcessorResponse
} from '../../auxiliaryGeneration';
import { getRunningSandboxId } from '../../sandbox/interface/runtime';
import { getSandboxToolInfo } from '../../sandbox/interface/toolCall';
import { createSkillDebugEventAdapter } from './eventAdapter';
import {
  buildSkillDebugAgentLoopMemories,
  compactSkillDebugPlanSnapshots,
  createSkillDebugAskInteractive,
  readSkillDebugActivePlan,
  readSkillDebugAgentLoopMemory
} from './memory';
import { createSkillDebugReadFileExecutor } from './readFile';
import { prepareSkillDebugRuntime, type SkillDebugSandboxPrepareAction } from './runtime';
import { buildSkillDebugUserContext, SKILL_DEBUG_MAX_FILES } from './userContext';

export type SkillDebugProcessorData = {
  model: string;
  systemPrompt: string;
  currentUserValue: UserChatItemValueItemType[];
  timezone: string;
  userKey?: OpenaiAccountType;
  modelCapabilities: {
    vision?: boolean;
    audio?: boolean;
    video?: boolean;
  };
};

type SkillDebugProcessorContext = {
  skillId: string;
  responseChatItemId: string;
  isInteractiveResume: boolean;
  prepareActions?: SkillDebugSandboxPrepareAction[];
};

const toolReferenceReg = /\{\{@([^@{}]+)@\}\}/g;

/** 将 Skill system prompt 中的系统工具引用替换为模型实际可见的名称。 */
const formatSkillDebugSystemPrompt = ({
  systemPrompt,
  lang
}: {
  systemPrompt: string;
  lang: AuxiliaryGenerationProcessorParams['user']['lang'];
}) =>
  [
    systemPrompt.replace(toolReferenceReg, (raw, id: string) => {
      const trimmedId = id.trim();
      const normalizedId = trimmedId.startsWith('t') ? trimmedId.slice(1) : trimmedId;
      const name =
        getSandboxToolInfo(trimmedId, lang)?.name || getSandboxToolInfo(normalizedId, lang)?.name;
      return name ? `{{${name}}}` : raw;
    }),
    SKILL_EDIT_SANDBOX_SYSTEM_PROMPT
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * 创建 Skill Debug 处理器。
 *
 * 处理器直接调用稳定 Agent Loop；Skill 域负责 sandbox、附件、ask 恢复和 ChatBox 产物，
 * 不构造 Workflow 节点，也不经过 Workflow Dispatcher。
 */
export const createSkillDebugProcessor = ({
  skillId,
  responseChatItemId,
  isInteractiveResume,
  prepareActions
}: SkillDebugProcessorContext) => {
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
  }: AuxiliaryGenerationProcessorParams<SkillDebugProcessorData>): Promise<AuxiliaryGenerationProcessorResponse> => {
    streamWriter?.(
      workflowSseEvent.sandboxStatus({
        sandboxId: getRunningSandboxId({
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: skillId,
          userId: user.userId
        }),
        phase: 'lazyInit'
      })
    );

    const runtime = await prepareSkillDebugRuntime({
      skillId,
      userId: user.userId,
      prepareActions
    });
    const userContext = buildSkillDebugUserContext({
      histories,
      currentUserValue: data.currentUserValue,
      currentDataId: responseChatItemId,
      requestOrigin,
      maxFiles: maxFiles ?? SKILL_DEBUG_MAX_FILES,
      skillInfos: runtime.skillInfos,
      currentWorkingDirectory: runtime.currentWorkingDirectory,
      currentTime: getSystemTime(data.timezone)
    });
    const adapter = createSkillDebugEventAdapter({ streamWriter, lang: user.lang });
    const restoredMemory = readSkillDebugAgentLoopMemory({ histories });
    const providerState = isInteractiveResume ? restoredMemory.providerState : undefined;
    const continuation =
      providerState !== undefined
        ? {
            type: 'ask' as const,
            answer: query,
            ...(userContext.askContinuationMessages.length > 0
              ? { additionalMessages: userContext.askContinuationMessages }
              : {})
          }
        : undefined;

    const loopResult = await runAgentLoop({
      runtime: {
        teamId: user.teamId,
        lang: user.lang,
        llmParams: {
          model: data.model,
          userKey: data.userKey,
          stream: true,
          useVision: data.modelCapabilities.vision,
          useAudio: data.modelCapabilities.audio,
          useVideo: data.modelCapabilities.video
        },
        systemTools: {
          plan: { enabled: true },
          ask: { enabled: true },
          sandbox: {
            enabled: true,
            client: runtime.sandboxClient
          },
          readFile: {
            enabled: true,
            maxFileAmount: maxFiles ?? SKILL_DEBUG_MAX_FILES,
            execute: createSkillDebugReadFileExecutor({
              readableFileUrls: userContext.readableFileUrls,
              maxFileAmount: maxFiles ?? SKILL_DEBUG_MAX_FILES,
              teamId: user.teamId,
              tmbId: user.tmbId,
              customPdfParse,
              usageId
            })
          }
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: async () => {
          throw new Error('Skill Debug does not register runtime tools');
        },
        checkIsStopping,
        usagePush: usageSink,
        emitEvent: adapter.emitEvent
      },
      input: {
        systemPrompt: formatSkillDebugSystemPrompt({
          systemPrompt: data.systemPrompt,
          lang: user.lang
        }),
        messages: userContext.messages,
        activePlan: readSkillDebugActivePlan({ histories }),
        providerState,
        continuation
      }
    });

    const aiResponse = compactSkillDebugPlanSnapshots(
      adapter.buildAssistantResponses(loopResult.assistantMessages)
    );

    if (loopResult.status === 'paused') {
      if (loopResult.pause.type !== 'ask') {
        throw new Error('Skill Debug does not support child tool interactive responses');
      }

      const interactive = createSkillDebugAskInteractive({
        askId: loopResult.pause.askId,
        ask: loopResult.pause.ask,
        usageId
      });
      aiResponse.push({ interactive });
      streamWriter?.(workflowSseEvent.interactive(interactive));
    } else if (loopResult.status === 'error') {
      const errorText = getErrText(loopResult.error, 'Skill Debug agent loop failed');
      if (errorText) {
        aiResponse.push({ text: { content: errorText } });
      }
    }

    adapter.nodeResponses.forEach((nodeResponse) => {
      streamWriter?.(workflowSseEvent.flowNodeResponse(nodeResponse));
    });

    return {
      aiResponse,
      nodeResponses: adapter.nodeResponses,
      memories: buildSkillDebugAgentLoopMemories(
        loopResult.status === 'paused' ? loopResult.providerState : undefined
      )
    };
  };
};
