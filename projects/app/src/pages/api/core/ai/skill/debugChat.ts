import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  getLastInteractiveValue,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps,
  updateInteractiveChat
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound, type PreChatRoundResult } from '@fastgpt/service/core/chat/utils/prepare';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getDefaultLLMModel } from '@fastgpt/service/core/ai/model';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit/config';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { findSandboxInstanceBySandboxId } from '@fastgpt/service/core/ai/sandbox/instance/repository';
import { getSandboxProviderConfig } from '@fastgpt/service/core/ai/sandbox/provider/config';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import {
  SkillDebugChatBodySchema,
  type SkillDebugChatBody
} from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  createWorkflowStreamResponseContext,
  type WorkflowStreamResponseContext
} from '@/service/core/workflow/streamResponseContext';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

export type Props = Omit<SkillDebugChatBody, 'messages'> & {
  messages: ChatCompletionMessageParam[];
};

// Node IDs for the minimal workflow
const START_NODE_ID = 'skill-debug-start';
const AGENT_NODE_ID = 'skill-debug-agent';

/**
 * Build a minimal two-node runtime workflow for skill debug:
 * workflowStart -> agent (with editSkillId)
 */
export function buildDebugRuntimeNodes(
  skillId: string,
  model: string,
  systemPrompt: string
): {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
} {
  const runtimeNodes: RuntimeNodeItemType[] = [
    {
      nodeId: START_NODE_ID,
      name: 'Workflow Start',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      showStatus: false,
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'User Question',
          toolDescription: 'user question',
          required: true,
          value: ''
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.userChatInput,
          key: NodeOutputKeyEnum.userChatInput,
          label: 'User Question',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    },
    {
      nodeId: AGENT_NODE_ID,
      name: 'Agent',
      avatar: '',
      intro: '',
      flowNodeType: FlowNodeTypeEnum.agent,
      showStatus: true,
      isEntry: false,
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'User Question',
          required: true,
          // Reference to start node output: [nodeId, outputKey]
          value: [START_NODE_ID, NodeOutputKeyEnum.userChatInput]
        },
        {
          key: NodeInputKeyEnum.history,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput],
          valueType: WorkflowIOValueTypeEnum.chatHistory,
          label: 'Chat History',
          required: true,
          min: 0,
          max: 50,
          value: 20
        },
        {
          key: NodeInputKeyEnum.aiModel,
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
          label: 'AI Model',
          required: true,
          valueType: WorkflowIOValueTypeEnum.string,
          value: model
        },
        {
          key: NodeInputKeyEnum.aiSystemPrompt,
          renderTypeList: [FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'System Prompt',
          value: systemPrompt
        },
        {
          key: NodeInputKeyEnum.editSkillId,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.string,
          label: 'Edit Skill ID',
          value: skillId
        }
      ],
      outputs: [
        {
          id: NodeOutputKeyEnum.answerText,
          key: NodeOutputKeyEnum.answerText,
          label: 'Answer',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    }
  ];

  const runtimeEdges: RuntimeEdgeItemType[] = [
    {
      source: START_NODE_ID,
      sourceHandle: getHandleId(START_NODE_ID, 'source', 'right'),
      target: AGENT_NODE_ID,
      targetHandle: getHandleId(AGENT_NODE_ID, 'target', 'left'),
      status: 'waiting'
    }
  ];

  return { runtimeNodes, runtimeEdges };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let skillId = '';
  let streamResponseContext: WorkflowStreamResponseContext | undefined;
  const roundState = {
    preparedRound: undefined as PreChatRoundResult | undefined,
    appId: '',
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
    }).body as Props;
    skillId = parsedSkillId;

    // Validate required parameters
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new UserError('messages is required');
    }

    const resolvedModel = model || getDefaultLLMModel().model;

    const originIp = getIpFromRequest(req);

    // Authenticate skill access
    const { teamId, tmbId, skill } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId,
      per: ReadPermissionVal
    });

    // Frequency limit
    if (!(await teamFrequencyLimit({ teamId, type: LimitTypeEnum.chat, res }))) {
      return;
    }

    // Verify edit-debug sandbox exists for this skill
    const providerConfig = getSandboxProviderConfig();
    const editDebugSandboxId = getEditDebugSandboxId(skillId);
    const sandboxInstance = await findSandboxInstanceBySandboxId({
      provider: providerConfig.provider,
      sandboxId: editDebugSandboxId,
      appId: skillId,
      type: SandboxTypeEnum.editDebug
    });
    if (!sandboxInstance) {
      throw new UserError(
        'Edit debug sandbox not found. Please create it via /api/core/ai/skill/edit first.'
      );
    }
    logger.debug('Edit debug sandbox found', { skillId, sandboxId: sandboxInstance.sandboxId });

    // Parse messages: pop the last human message as userQuestion
    const chatMessages = GPTMessages2Chats({ messages });
    const userQuestion = chatMessages.pop() as UserChatItemType;
    if (!userQuestion) {
      throw new UserError('User question is empty');
    }

    // Load chat history (using skillId as virtual appId)
    const { histories } = await getChatItems({
      appId: skillId,
      chatId,
      offset: 0,
      limit: 20,
      field: 'obj value memories'
    });

    const newHistories = concatHistories(histories, chatMessages);
    const interactive = getLastInteractiveValue(newHistories);
    const preparedRound = await preChatRound({
      appId: skillId,
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
    roundState.appId = skillId;
    roundState.chatId = runningChatId;
    roundState.responseChatItemId = finalResponseChatItemId;

    // Build the minimal workflow
    const { runtimeNodes, runtimeEdges } = buildDebugRuntimeNodes(
      skillId,
      resolvedModel,
      systemPrompt
    );

    streamResponseContext = await createWorkflowStreamResponseContext({
      req,
      res,
      stream: true,
      detail: true,
      teamId,
      appId: skillId,
      chatId: runningChatId,
      responseId: runningChatId,
      showNodeStatus: true
    });

    logger.debug('Dispatching skill debug workflow', { skillId, chatId, model });

    // Execute workflow
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
        id: skillId,
        name: skill.name,
        teamId,
        tmbId,
        sandboxId: editDebugSandboxId
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
      }
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

    // 前端当前轮次依赖流式内存态展示积分；最终 nodeResponse 需要在 [DONE] 前推送。
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

    // Send finish signals
    streamResponseContext.responseWrite({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({ text: null, finish_reason: 'stop' })
    });
    streamResponseContext.responseWrite({
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    // Save chat records (using skillId as virtual appId)
    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: finalResponseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      [DispatchNodeResponseKeyEnum.nodeResponse]: computedFlowResponses,
      customFeedbacks
    };

    const saveParams: SaveChatProps = {
      chatId: runningChatId,
      appId: skillId,
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
        appId: skillId,
        chatId: runningChatId,
        status: ChatGenerateStatusEnum.done
      });
    }

    await streamResponseContext.flushResume();
  } catch (err: any) {
    const { preparedRound } = roundState;
    if (
      !roundState.finalized &&
      preparedRound?.shouldPersistChatRound &&
      roundState.appId &&
      roundState.chatId
    ) {
      if (preparedRound.shouldFinalizePreparedRound) {
        await failChatRound({
          appId: roundState.appId,
          chatId: roundState.chatId,
          responseChatItemId: roundState.responseChatItemId,
          error: err
        });
      } else {
        await updateChatGenerateStatus({
          appId: roundState.appId,
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

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
