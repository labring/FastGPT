import type { NodeApiRequest, NodeApiResponse, NodeHttpRequest } from '../../../../types/http';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { SkillDebugChatBody } from '@fastgpt/global/core/ai/skill/api';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  ChatWorkflowSseResponseSchema,
  type ChatWorkflowSseResponseType
} from '@fastgpt/global/openapi/core/chat/completion/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { teamFrequencyLimit, LimitTypeEnum } from '../../../../common/api/frequencyLimit';
import { getIpFromRequest } from '../../../../common/geo';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getLocale } from '../../../../common/middle/i18n';
import { sseErrRes } from '../../../../common/response';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { assertAuthModels } from '../../../../support/permission/model/auth';
import { authSkill } from '../../../../support/permission/skill/auth';
import { getRunningUserInfoByTmbId } from '../../../../support/user/team/utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';

import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { updateChatGenerateStatus } from '../../../chat/chatGenerateStatus';
import { getChatItems } from '../../../chat/controller';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps,
  updateInteractiveChat
} from '../../../chat/saveChat';
import { preChatRound, type PreChatRoundResult } from '../../../chat/utils/prepare';
import { WORKFLOW_MAX_RUN_TIMES } from '../../../workflow/constants';
import { dispatchWorkFlow } from '../../../workflow/dispatch';
import type { AgentSandboxPrepareAction } from '../../../workflow/dispatch/ai/agent/sub/sandbox';
import { prepareWorkflowFileQuery } from '../../../workflow/utils/fileLimits';
import { createWorkflowResourceContext } from '../../../workflow/resource/context';
import {
  createWorkflowStreamResponseContext,
  type WorkflowStreamResponseContext
} from '../../../workflow/utils/streamResponseContext';
import { getRunningSkillEditSandbox } from '../../sandbox/application/skillEdit/runtime';
import { buildDebugRuntimeNodes } from './runtime';

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
 * SSE 上下文，使 Next API 和其他 HTTP 适配层能够共享同一业务流程。
 */
export async function runSkillDebugChat({
  req,
  body,
  options
}: {
  req: NodeHttpRequest;
  body: SkillDebugChatBody;
  options: RunSkillDebugChatOptions;
}): Promise<void> {
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

    const { teamId, tmbId, isRoot, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: WritePermissionVal
    });
    // Skill 编辑权限不包含任意模型的使用权限，创建对话和调用沙盒前单独校验。
    const {
      handle: modelHandle,
      models: [modelData]
    } = await assertAuthModels({
      actor: { teamId, tmbId, isRoot },
      modelIds: [modelId],
      type: ModelTypeEnum.llm
    });

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
      // 入口已鉴权的资源即本次调试的完整快照：固定节点只在内存核对，不再重复鉴权；
      // 快照外的静态资源一律视为未声明，动态引用仍按运行人鉴权。
      resourceContext: createWorkflowResourceContext({
        resources: [{ type: 'model', id: modelData.modelId }],
        teamId,
        isRoot
      }),
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
    // 本轮耗时由 dispatch 在 root runtime 统一下发（本流的 writer 已交给它），此处重复下发会让客户端累加翻倍。

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
  } finally {
    // runner 统一等待缓存收尾，HTTP 响应仍由调用方关闭。
    await streamResponseContext?.flushResume();
  }
}

/**
 * Next API 的 Skill 调试适配器。
 *
 * 保留既有接口行为，并把 Node 响应相关的限流 header、SSE 初始化和结束动作
 * 注入通用 runner，保留现有路由签名、限流策略和响应格式。
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
    await runSkillDebugChat({
      req,
      body,
      options: {
        agentSandboxPrepareActions: options.agentSandboxPrepareActions,
        checkTeamFrequencyLimit: (teamId) =>
          teamFrequencyLimit({ teamId, type: LimitTypeEnum.chat, res }),
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
      }
    });
  } catch (error) {
    sseErrRes(res, error);
  }

  // 限流适配器可能已写入并结束 429 响应，避免重复结束同一个响应。
  if (!res.writableEnded) res.end();

  // SSE 内容已经直接写入 res；返回值仅用于让路由类型和 OpenAPI 共用同一响应契约。
  return ChatWorkflowSseResponseSchema.parse('');
}
