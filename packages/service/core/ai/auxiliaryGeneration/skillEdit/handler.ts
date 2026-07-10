import type { NextApiRequest, NextApiResponse } from 'next';
import { SkillDebugChatBodySchema } from '@fastgpt/global/core/ai/skill/api';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemType,
  ChatItemMiniType,
  UserChatItemType
} from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/tools';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import {
  createAskAgentTool,
  createUpdatePlanTool,
  type AgentLoopToolCatalog
} from '../../llm/agentLoop';
import { parseApiInput } from '../../../../common/zod/requestParseError';
import { sseErrRes } from '../../../../common/response';
import { authSkill } from '../../../../support/permission/skill/auth';
import { getIpFromRequest } from '../../../../common/geo';
import { getLocale } from '../../../../common/middle/i18n';
import { teamFrequencyLimit, LimitTypeEnum } from '../../../../common/api/frequencyLimit';
import { getLogger, LogCategories } from '../../../../common/logger';
import { createChatFilePreviewUrlGetter } from '../../../../common/s3/sources/chat';
import { validateFileUrlDomain } from '../../../../common/security/fileUrlValidator';
import { getDefaultLLMModel, getLLMModel } from '../../model';
import { getRunningSkillEditSandbox } from '../../sandbox/interface/skillEdit';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../skill/edit/config';
import { runSandboxTools } from '../../sandbox/interface/toolCall';
import { getChatItems } from '../../../chat/controller';
import { preChatRound, type PreChatRoundResult } from '../../../chat/utils/prepare';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps,
  updateInteractiveChat
} from '../../../chat/saveChat';
import { updateChatGenerateStatus } from '../../../chat/chatGenerateStatus';
import { WorkflowNodeResponseWriter } from '../../../chat/nodeResponseStorage';
import { addPreviewUrlToChatItems } from '../../../chat/utils';
import { getUserChatInfo } from '../../../../support/user/team/utils';
import {
  runAuxiliaryGeneration,
  runAuxiliaryGenerationAgentLoop,
  type AuxiliaryGenerationStreamContext
} from '..';
import { prepareSkillEditRuntime } from './runtime';
import {
  buildSkillEditAgentLoopMemories,
  createSkillEditAskInteractive,
  getSkillEditAgentLoopMemoryKey,
  readSkillEditAgentLoopMemory
} from './utils';
import { createSkillEditAgentLoopAdapter } from './agentLoopAdapter';
import { buildSkillEditUserContext, SKILL_EDIT_MAX_FILES } from './userContext';
import { runSkillEditReadFiles, skillEditReadFilesTool } from './tools';
import {
  getRunningSandboxId,
  type AgentSandboxPrepareAction
} from '../../sandbox/interface/runtime';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

type SkillEditProcessorData = {
  model: string;
  systemPrompt: string;
  contextMessages: ChatItemMiniType[];
  currentUserValue: UserChatItemType['value'];
  timezone: string;
  userKey?: OpenaiAccountType;
};

/**
 * 处理 Skill 编辑调试对话。
 *
 * 该入口保留原 debugChat API 和 ChatBox 协议，但执行层不再构造 workflow 节点，
 * 而是直接通过辅助生成生命周期运行带 sandbox tools 的 agent loop。
 */
export async function handleSkillEditChat(
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    agentSandboxPrepareActions?: AgentSandboxPrepareAction[];
  } = {}
) {
  let skillId = '';
  let streamContext: AuxiliaryGenerationStreamContext | undefined;
  const roundState = {
    preparedRound: undefined as PreChatRoundResult | undefined,
    sourceType: undefined as ChatSourceTypeEnum | undefined,
    sourceId: '',
    chatId: '',
    responseChatItemId: '',
    finalized: false
  };

  try {
    const {
      skillId: parsedSkillId,
      chatId,
      responseChatItemId: responseChatItemIdFromBody = getNanoid(),
      messages = [],
      model,
      systemPrompt = ''
    } = parseApiInput({
      req,
      bodySchema: SkillDebugChatBodySchema
    }).body;
    skillId = parsedSkillId;
    const chatSource = {
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new UserError('messages is required');
    }

    const resolvedModel = model || getDefaultLLMModel().model;
    const modelData = getLLMModel(resolvedModel);
    if (!modelData) {
      throw new UserError('Can not get model data');
    }

    const originIp = getIpFromRequest(req);
    const lang = getLocale(req);

    const { teamId, tmbId, userId, isRoot, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });
    const { timezone, externalProvider } = await getUserChatInfo(tmbId);

    if (!(await teamFrequencyLimit({ teamId, type: LimitTypeEnum.chat, res }))) {
      return;
    }

    const sandboxInstance = await getRunningSkillEditSandbox({ skillId, teamId });
    if (!sandboxInstance) {
      throw new UserError(
        'Edit debug sandbox not found. Please initialize it via /api/core/ai/skill/runtime/init first.'
      );
    }

    const chatMessages = GPTMessages2Chats({ messages });
    const userQuestion = chatMessages.pop() as UserChatItemType;
    if (!userQuestion) {
      throw new UserError('User question is empty');
    }

    const { histories } = await getChatItems({
      ...chatSource,
      chatId,
      offset: 0,
      limit: 20,
      field: 'obj value memories'
    });
    const newHistories = concatHistories(histories, chatMessages);
    const userQuestionValue = removeEmptyUserInput(userQuestion.value);
    const { text: queryText = '', files: queryFiles = [] } =
      chatValue2RuntimePrompt(userQuestionValue);
    const invalidInput = queryFiles.some((file) => file.url && !validateFileUrlDomain(file.url));
    if (invalidInput) {
      throw new UserError('Invalid file url');
    }

    const getPreviewUrl = createChatFilePreviewUrlGetter();
    await Promise.all([
      addPreviewUrlToChatItems(newHistories, 'chatFlow'),
      ...queryFiles.map(async (file) => {
        if (!file.key) return;
        file.url = await getPreviewUrl(file.key);
      })
    ]);
    const interactive = getLastInteractiveValue(newHistories);
    const preparedRound = await preChatRound({
      ...chatSource,
      chatId,
      teamId,
      tmbId,
      source: ChatSourceEnum.test,
      userContent: userQuestion,
      responseChatItemId: responseChatItemIdFromBody,
      interactive
    });
    const runningChatId = preparedRound.chatId;
    const finalResponseChatItemId = preparedRound.responseChatItemId;
    roundState.preparedRound = preparedRound;
    roundState.sourceType = chatSource.sourceType;
    roundState.sourceId = chatSource.sourceId;
    roundState.chatId = runningChatId;
    roundState.responseChatItemId = finalResponseChatItemId;

    const result = await runAuxiliaryGeneration({
      req,
      res,
      teamId,
      tmbId,
      userId,
      isRoot,
      lang,
      appName: skill.name,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: runningChatId,
      query: queryText,
      files: [],
      data: {
        model: modelData.model,
        systemPrompt,
        contextMessages: chatMessages,
        currentUserValue: userQuestionValue,
        timezone: timezone ?? 'Asia/Shanghai',
        userKey: externalProvider.openaiAccount
      } satisfies SkillEditProcessorData,
      histories,
      usageSource: UsageSourceEnum.fastgpt,
      usageId: interactive?.usageId,
      maxFiles: SKILL_EDIT_MAX_FILES,
      customPdfParse: false,
      processor: async ({
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
      }) => {
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
              userId,
              chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
            }),
            phase: 'lazyInit'
          })
        );
        const runtime = await prepareSkillEditRuntime({
          skillId,
          userId,
          teamId,
          prepareActions: options.agentSandboxPrepareActions
        });
        const userContext = buildSkillEditUserContext({
          histories,
          contextMessages: data.contextMessages,
          currentUserValue: data.currentUserValue,
          currentDataId: finalResponseChatItemId,
          requestOrigin,
          maxFiles: maxFiles ?? SKILL_EDIT_MAX_FILES,
          skillInfos: runtime.skillInfos,
          currentWorkingDirectory: runtime.currentWorkingDirectory,
          currentTime: getSystemTime(data.timezone)
        });
        const adapter = createSkillEditAgentLoopAdapter({
          streamWriter,
          toolCatalog,
          lang
        });
        const restoredMemory = readSkillEditAgentLoopMemory({ histories });

        const loopResult = await runAuxiliaryGenerationAgentLoop({
          teamId: user.teamId,
          userKey: data.userKey,
          model: data.model,
          systemPrompt: [data.systemPrompt, SANDBOX_SYSTEM_PROMPT].filter(Boolean).join('\n\n'),
          messages: userContext.messages,
          useVision: modelData.vision,
          useAudio: modelData.audio,
          useVideo: modelData.video,
          streamWriter,
          checkIsStopping,
          usageSink,
          toolCatalog,
          pendingMainContext: restoredMemory.pendingMainContext,
          userAnswer: restoredMemory.pendingMainContext ? query : undefined,
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
                userId,
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
            pendingMainContext:
              loopResult.status === 'ask' ? loopResult.pendingMainContext : undefined
          })
        };
      },
      onStreamContextReady: (context) => {
        streamContext = context;
      },
      onBeforeStreamDone: async ({ result, durationSeconds }) => {
        const aiResponse: AIChatItemType & { dataId?: string } = {
          dataId: finalResponseChatItemId,
          obj: ChatRoleEnum.AI,
          value: result.aiResponse,
          memories: result.memories
        };
        const nodeResponseWriter = new WorkflowNodeResponseWriter({
          ...chatSource,
          chatId: runningChatId,
          chatItemDataId: finalResponseChatItemId,
          teamId,
          persistToDb: true,
          retainInMemory: false
        });
        await nodeResponseWriter.record(result.nodeResponses);
        await nodeResponseWriter.close();

        const saveParams: SaveChatProps = {
          ...chatSource,
          chatId: runningChatId,
          teamId,
          tmbId,
          nodes: [],
          appChatConfig: {},
          variables: {},
          source: ChatSourceEnum.test,
          userContent: userQuestion,
          aiContent: aiResponse,
          durationSeconds,
          nodeResponseSummary: nodeResponseWriter.getSummary(),
          metadata: { originIp }
        };

        if (interactive) {
          await updateInteractiveChat({
            interactive,
            shouldFinalizePreparedRound: preparedRound.shouldFinalizePreparedRound,
            ...saveParams
          });
        } else if (preparedRound.shouldFinalizePreparedRound) {
          await finalizeChatRound(saveParams);
        }
        roundState.finalized = true;

        if (!preparedRound.shouldFinalizePreparedRound && preparedRound.shouldPersistChatRound) {
          await updateChatGenerateStatus({
            ...chatSource,
            chatId: runningChatId,
            status: ChatGenerateStatusEnum.done
          });
        }
      }
    });
    streamContext = result.streamContext;

    await streamContext.flushResume();
  } catch (err: any) {
    const { preparedRound } = roundState;
    if (
      !roundState.finalized &&
      preparedRound?.shouldPersistChatRound &&
      roundState.sourceType &&
      roundState.sourceId &&
      roundState.chatId
    ) {
      if (preparedRound.shouldFinalizePreparedRound) {
        await failChatRound({
          sourceType: roundState.sourceType,
          sourceId: roundState.sourceId,
          chatId: roundState.chatId,
          responseChatItemId: roundState.responseChatItemId,
          error: err
        });
      } else {
        await updateChatGenerateStatus({
          sourceType: roundState.sourceType,
          sourceId: roundState.sourceId,
          chatId: roundState.chatId,
          status: ChatGenerateStatusEnum.error
        });
      }
    }

    logger.error('Skill edit debug chat error', { error: err, skillId });
    if (streamContext) {
      streamContext.writeError(err);
      await streamContext.flushResume();
    } else {
      sseErrRes(res, err);
    }
  }

  res.end();
}
