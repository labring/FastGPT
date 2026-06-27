import type { NextApiRequest, NextApiResponse } from 'next';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  getLastInteractiveValue,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { SkillDebugChatBodySchema } from '@fastgpt/global/core/ai/skill/api';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { sseErrRes } from '../../../../common/response';
import { parseApiInput } from '../../../../common/zod/requestParseError';
import { authSkill } from '../../../../support/permission/skill/auth';
import { teamFrequencyLimit, LimitTypeEnum } from '../../../../common/api/frequencyLimit';
import { getIpFromRequest } from '../../../../common/geo';
import { getLocale } from '../../../../common/middle/i18n';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getRunningUserInfoByTmbId } from '../../../../support/user/team/utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { getDefaultLLMModel } from '../../model';
import { getEditDebugSandboxId } from '../edit/config';
import { findSandboxInstanceBySandboxIdAndSource } from '../../sandbox/instance/repository';
import { getSandboxProviderConfig } from '../../sandbox/provider/config';
import { dispatchWorkFlow } from '../../../workflow/dispatch';
import { WORKFLOW_MAX_RUN_TIMES } from '../../../workflow/constants';
import { getChatItems } from '../../../chat/controller';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps,
  updateInteractiveChat
} from '../../../chat/saveChat';
import { preChatRound, type PreChatRoundResult } from '../../../chat/utils/prepare';
import { updateChatGenerateStatus } from '../../../chat/chatGenerateStatus';
import {
  createSkillDebugStreamResponseContext,
  type SkillDebugStreamResponseContext
} from './streamResponseContext';
import { buildDebugRuntimeNodes } from './runtime';
import type { AgentSandboxPrepareAction } from '../../../workflow/dispatch/ai/agent/sub/sandbox';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

/**
 * 处理 Skill 调试对话的共享主流程。
 *
 * 开源 API 与 Pro API 都调用这里；差异只通过 options 显式传入，避免复制 chat round、
 * workflow 调度和 SSE 收尾逻辑。
 */
export async function handleSkillDebugChat(
  req: NextApiRequest,
  res: NextApiResponse,
  options: {
    agentSandboxPrepareActions?: AgentSandboxPrepareAction[];
  } = {}
) {
  let skillId = '';
  let streamResponseContext: SkillDebugStreamResponseContext | undefined;
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
    const originIp = getIpFromRequest(req);

    const { teamId, tmbId, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: ReadPermissionVal
    });

    if (!(await teamFrequencyLimit({ teamId, type: LimitTypeEnum.chat, res }))) {
      return;
    }

    const providerConfig = getSandboxProviderConfig();
    const editDebugSandboxId = getEditDebugSandboxId(skillId);
    const sandboxInstance = await findSandboxInstanceBySandboxIdAndSource({
      provider: providerConfig.provider,
      sandboxId: editDebugSandboxId,
      sourceType: chatSource.sourceType,
      sourceId: chatSource.sourceId,
      type: SandboxTypeEnum.editDebug
    });
    if (!sandboxInstance) {
      throw new UserError(
        'Edit debug sandbox not found. Please create it via /api/core/ai/skill/edit first.'
      );
    }
    logger.debug('Edit debug sandbox found', { skillId, sandboxId: sandboxInstance.sandboxId });

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

    const { runtimeNodes, runtimeEdges } = buildDebugRuntimeNodes(
      skillId,
      resolvedModel,
      systemPrompt
    );

    streamResponseContext = await createSkillDebugStreamResponseContext({
      req,
      res,
      stream: true,
      detail: true,
      teamId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      chatId: runningChatId,
      responseId: runningChatId,
      showNodeStatus: true
    });

    logger.debug('Dispatching skill debug workflow', { skillId, chatId, model });

    const {
      flatNodeResponses,
      assistantResponses,
      system_memories,
      durationSeconds,
      customFeedbacks,
      nodeResponseSummary
    } = await dispatchWorkFlow({
      apiVersion: 'v2',
      res,
      lang: getLocale(req),
      requestOrigin: req.headers.origin,
      mode: 'test',
      usageSource: UsageSourceEnum.fastgpt,
      uid: tmbId,
      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        name: skill.name,
        teamId,
        tmbId
      },
      runningUserInfo: await getRunningUserInfoByTmbId(tmbId),
      chatId: runningChatId,
      responseChatItemId: finalResponseChatItemId,
      runtimeNodes,
      runtimeEdges,
      variables: {},
      query: removeEmptyUserInput(userQuestion.value),
      lastInteractive: interactive,
      chatConfig: {},
      histories: newHistories,
      stream: true,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
      workflowStreamResponse: streamResponseContext.responseWrite,
      responseDetail: true,
      nodeResponseWriteConfig: {
        persistToDb: true,
        retainInMemory: true
      },
      agentSandboxPrepareActions: options.agentSandboxPrepareActions
    });

    const computedFlowResponses = (flatNodeResponses || []).map((item) => {
      if (item.totalPoints && item.totalPoints > 0) return item;

      if (item.model && (item.inputTokens !== undefined || item.outputTokens !== undefined)) {
        try {
          const { totalPoints } = formatModelChars2Points({
            model: item.model,
            inputTokens: item.inputTokens ?? 0,
            outputTokens: item.outputTokens ?? 0
          });
          if (totalPoints > 0) {
            return {
              ...item,
              totalPoints
            };
          }
        } catch (e) {
          logger.error('recompute debug points error', { error: e });
        }
      }
      return item;
    });

    logger.debug('Skill debug workflow completed', { skillId, chatId, durationSeconds });

    computedFlowResponses.forEach((nodeResponse) => {
      streamResponseContext?.responseWrite({
        event: SseResponseEventEnum.flowNodeResponse,
        data: nodeResponse
      });
    });
    streamResponseContext.responseWrite({
      event: SseResponseEventEnum.workflowDuration,
      data: {
        durationSeconds
      }
    });

    streamResponseContext.responseWrite({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({ text: null, finish_reason: 'stop' })
    });

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: finalResponseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      [DispatchNodeResponseKeyEnum.nodeResponse]: computedFlowResponses,
      customFeedbacks
    };

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
      nodeResponseSummary,
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

    streamResponseContext.responseWrite({
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    await streamResponseContext.flushResume();
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

    logger.error('Skill debug chat error', { error: err, skillId });
    if (streamResponseContext) {
      streamResponseContext.writeStreamError(err);
    } else {
      sseErrRes(res, err);
    }
    await streamResponseContext?.flushResume();
  }

  res.end();
}
