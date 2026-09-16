import { getModelHandle } from '../../model';
import type { NodeApiRequest, NodeApiResponse, NodeHttpRequest } from '../../../../types/http';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import type { SkillDebugChatBody } from '@fastgpt/global/core/ai/skill/api';
import {
  ChatWorkflowSseResponseSchema,
  type ChatWorkflowSseResponseType
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { sseErrRes } from '../../../../common/response';
import { authSkill } from '../../../../support/permission/skill/auth';
import {
  createNodeApiLimitResponse,
  teamFrequencyLimit,
  LimitTypeEnum
} from '../../../../common/api/frequencyLimit';
import { getIpFromRequest } from '../../../../common/geo';
import { getLocale } from '../../../../common/middle/i18n';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getRunningUserInfoByTmbId } from '../../../../support/user/team/utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';

import { getRunningSkillEditSandbox } from '../../sandbox/interface/skillEdit';
import { dispatchWorkFlow } from '../../../workflow/dispatch';
import { prepareWorkflowFileQuery } from '../../../workflow/utils/fileLimits';
import { WORKFLOW_MAX_RUN_TIMES } from '../../../workflow/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
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
  createWorkflowStreamResponseContext,
  type WorkflowStreamResponseContext
} from '../../../workflow/utils/streamResponseContext';
import { buildDebugRuntimeNodes } from './runtime';
import type { AgentSandboxPrepareAction } from '../../../workflow/dispatch/ai/agent/sub/sandbox';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);
const skillDebugFileSelectConfig: AppFileSelectConfigType = {
  maxFiles: 10,
  canSelectFile: true,
  canSelectImg: true,
  customPdfParse: false,
  canSelectVideo: true,
  canSelectAudio: true,
  canSelectCustomFileExtension: false,
  customFileExtensionList: []
};

export type SkillDebugChatStreamContextFactoryParams = {
  teamId: string;
  skillId: string;
  chatId: string;
};

export type RunSkillDebugChatOptions = {
  agentSandboxPrepareActions?: AgentSandboxPrepareAction[];
  checkTeamFrequencyLimit: (teamId: string) => Promise<boolean>;
  createStreamResponseContext: (
    params: SkillDebugChatStreamContextFactoryParams
  ) => Promise<WorkflowStreamResponseContext>;
  workflowResponse?: NodeApiResponse;
};

/**
 * 执行与 HTTP 框架无关的 Skill 调试对话主流程。
 *
 * 权限、聊天轮次、Workflow、usage 和失败收尾只在这里维护。调用方注入限流与
 * SSE 上下文，使 Next 和 Max Hono 服务能够共享同一业务流程。
 */
export async function runSkillDebugChat(
  req: NodeHttpRequest,
  body: SkillDebugChatBody,
  options: RunSkillDebugChatOptions
): Promise<void> {
  let skillId = '';
  let streamResponseContext: WorkflowStreamResponseContext | undefined;
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
      modelId,
      systemPrompt = ''
    } = body;
    skillId = parsedSkillId;
    const chatSource = {
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new UserError('messages is required');
    }

    const originIp = getIpFromRequest(req);

    const { teamId, tmbId, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });
    const modelHandle = await getModelHandle();
    const modelData = modelHandle.getLLMModelData({ modelId });

    if (!(await options.checkTeamFrequencyLimit(teamId))) {
      return;
    }

    const sandboxInstance = await getRunningSkillEditSandbox({ skillId, teamId });
    if (!sandboxInstance) {
      throw new UserError(
        'Edit debug sandbox not found. Please initialize it via /api/core/ai/skill/runtime/init first.'
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
    const chatConfig = {
      fileSelectConfig: skillDebugFileSelectConfig
    };
    const {
      query: workflowQuery,
      maxFileAmount,
      maxBytesPerFile
    } = await prepareWorkflowFileQuery({
      teamId,
      chatConfig,
      query: userQuestion.value
    });
    const workflowUserQuestion: UserChatItemType = {
      ...userQuestion,
      value: workflowQuery
    };
    const preparedRound = await preChatRound({
      ...chatSource,
      chatId,
      teamId,
      tmbId,
      source: ChatSourceEnum.test,
      userContent: workflowUserQuestion,
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
      modelData.modelId,
      systemPrompt
    );

    streamResponseContext = await options.createStreamResponseContext({
      teamId,
      skillId,
      chatId: runningChatId
    });

    logger.debug('Dispatching skill debug workflow', {
      skillId,
      chatId,
      modelId: modelData.modelId
    });

    const {
      flatNodeResponses,
      assistantResponses,
      system_memories,
      durationSeconds,
      customFeedbacks,
      workflowRuntimeSummary
    } = await dispatchWorkFlow({
      apiVersion: 'v2',
      res: options.workflowResponse,
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
      query: removeEmptyUserInput(workflowQuery),
      maxFileAmount,
      maxBytesPerFile,
      lastInteractive: interactive,
      chatConfig,
      histories: newHistories,
      stream: true,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
      workflowStreamResponse: streamResponseContext.responseWrite,
      responseDetail: true,
      nodeResponseWriteConfig: {
        persistToDb: true,
        retainInMemory: true
      },
      // Skill 调试不是 App 运行，不带 Version 快照；静态资源按运行人 tmbId 鉴权。
      agentSandboxPrepareActions: options.agentSandboxPrepareActions
    });

    const computedFlowResponses = (flatNodeResponses || []).map((item) => {
      if (item.totalPoints && item.totalPoints > 0) return item;

      if (item.model && (item.inputTokens !== undefined || item.outputTokens !== undefined)) {
        try {
          const usageModel = modelHandle.findModelData({ model: item.model });
          if (!usageModel) return item;
          const { totalPoints } = formatModelChars2Points({
            model: usageModel,
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
      streamResponseContext?.responseWrite(workflowSseEvent.flowNodeResponse(nodeResponse));
    });
    streamResponseContext.responseWrite(workflowSseEvent.workflowDuration(durationSeconds));

    streamResponseContext.responseWrite(workflowSseEvent.answerStop());

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
      userContent: workflowUserQuestion,
      aiContent: aiResponse,
      durationSeconds,
      workflowRuntimeSummary,
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

    streamResponseContext.responseWrite(workflowSseEvent.done(SseResponseEventEnum.answer));

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

    if (!streamResponseContext) throw err;

    streamResponseContext.writeStreamError(err);
    await streamResponseContext.flushResume();
  }
}

/**
 * Next API 的 Skill 调试适配器。
 *
 * 保留既有接口行为，并把 Node 响应相关的限流 header、SSE 初始化和结束动作
 * 注入通用 runner；Max 使用自己的 Hono 适配器，不需要伪造 Node response。
 */
export async function handleSkillDebugChat(
  req: NodeApiRequest,
  res: NodeApiResponse,
  body: SkillDebugChatBody,
  options: {
    agentSandboxPrepareActions?: AgentSandboxPrepareAction[];
  } = {}
): Promise<ChatWorkflowSseResponseType> {
  try {
    await runSkillDebugChat(req, body, {
      agentSandboxPrepareActions: options.agentSandboxPrepareActions,
      checkTeamFrequencyLimit: (teamId) =>
        teamFrequencyLimit({
          teamId,
          type: LimitTypeEnum.chat,
          limitResponse: createNodeApiLimitResponse(res)
        }),
      createStreamResponseContext: ({ teamId, skillId, chatId }) =>
        createWorkflowStreamResponseContext({
          req,
          res,
          stream: true,
          detail: true,
          teamId,
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: skillId,
          chatId,
          responseId: chatId,
          showNodeStatus: true
        }),
      workflowResponse: res
    });
  } catch (error) {
    sseErrRes(res, error);
  }

  res.end();

  // SSE 内容已经直接写入 res；返回值仅用于让路由类型和 OpenAPI 共用同一响应契约。
  return ChatWorkflowSseResponseSchema.parse('');
}
