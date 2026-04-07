import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import { responseWrite } from '@fastgpt/service/common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import {
  concatHistories,
  getChatTitleFromChatMessage,
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import {
  getLastInteractiveValue,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { pushChatRecords, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { LimitTypeEnum, teamFrequencyLimit } from '@fastgpt/service/common/api/frequencyLimit';
import { getIpFromRequest } from '@fastgpt/service/common/geo';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getDefaultLLMModel } from '@fastgpt/service/core/ai/model';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
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

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

export type Props = {
  skillId: string;
  chatId: string;
  responseChatItemId?: string;
  messages: ChatCompletionMessageParam[];
  model?: string;
  systemPrompt?: string;
};

// Node IDs for the minimal workflow
const START_NODE_ID = 'skill-debug-start';
const AGENT_NODE_ID = 'skill-debug-agent';

/**
 * Build a minimal two-node runtime workflow for skill debug:
 * workflowStart -> agent (with useEditDebugSandbox=true + skillId)
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
          key: NodeInputKeyEnum.skills,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.arrayString,
          label: 'Skills',
          value: [skillId]
        },
        {
          key: NodeInputKeyEnum.useEditDebugSandbox,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.boolean,
          label: 'Use Edit Debug Sandbox',
          value: true
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
  const {
    skillId,
    chatId,
    responseChatItemId = getNanoid(),
    messages = [],
    model,
    systemPrompt = ''
  } = req.body as Props;

  try {
    // Validate required parameters
    if (!skillId) throw new UserError('skillId is required');
    if (!chatId) throw new UserError('chatId is required');
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
    const sandboxInstance = await MongoSandboxInstance.findOne({
      appId: skillId,
      chatId: 'edit-debug',
      'metadata.sandboxType': SandboxTypeEnum.editDebug
    }).lean();
    if (!sandboxInstance) {
      throw new UserError(
        'Edit debug sandbox not found. Please create it via /api/core/agentSkills/edit first.'
      );
    }
    logger.debug('Edit debug sandbox found', { skillId, sandboxId: String(sandboxInstance._id) });

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

    // Build the minimal workflow
    const { runtimeNodes, runtimeEdges } = buildDebugRuntimeNodes(
      skillId,
      resolvedModel,
      systemPrompt
    );

    // Setup SSE response
    const workflowResponseWrite = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      id: chatId,
      showNodeStatus: true
    });

    logger.debug('Dispatching skill debug workflow', { skillId, chatId, model });

    // Execute workflow
    const { flowResponses, assistantResponses, system_memories, durationSeconds, customFeedbacks } =
      await dispatchWorkFlow({
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
          tmbId
        },
        runningUserInfo: await getRunningUserInfoByTmbId(tmbId),

        chatId,
        responseChatItemId,
        runtimeNodes,
        runtimeEdges,
        variables: {},
        query: removeEmptyUserInput(userQuestion.value),
        lastInteractive: interactive,
        chatConfig: {},
        histories: newHistories,
        stream: true,
        maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
        workflowStreamResponse: workflowResponseWrite,
        responseDetail: true
      });

    logger.debug('Skill debug workflow completed', { skillId, chatId, durationSeconds });

    // Send finish signals
    workflowResponseWrite({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({ text: null, finish_reason: 'stop' })
    });
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    // Save chat records (using skillId as virtual appId)
    const newTitle = getChatTitleFromChatMessage(userQuestion);
    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses,
      customFeedbacks
    };

    const saveParams = {
      chatId,
      appId: skillId,
      teamId,
      tmbId,
      nodes: [],
      appChatConfig: {},
      variables: {},
      newTitle,
      source: ChatSourceEnum.test,
      userContent: userQuestion,
      aiContent: aiResponse,
      durationSeconds,
      metadata: { originIp }
    };

    if (interactive) {
      await updateInteractiveChat({ interactive, ...saveParams });
    } else {
      await pushChatRecords(saveParams);
    }
  } catch (err: any) {
    logger.error('Skill debug chat error', { error: err, skillId });
    sseErrRes(res, err);
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
