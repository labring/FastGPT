import type { NodeApiRequest, NodeApiResponse } from '../../../../types/http';
import { SkillDebugChatBodySchema } from '@fastgpt/global/core/ai/skill/api';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { concatHistories, removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
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
  type AuxiliaryGenerationStreamContext
} from '../../auxiliaryGeneration';
import { createSkillDebugProcessor, type SkillDebugProcessorData } from './processor';
import type { SkillDebugSandboxPrepareAction } from './runtime';
import { SKILL_DEBUG_MAX_FILES } from './userContext';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

/**
 * 处理 Skill 调试对话。
 *
 * API 保留原 ChatBox 协议，但执行层直接调用 Agent Loop；handler 只负责鉴权、chat round、
 * SSE 生命周期和持久化，不再构造或调度 Workflow。
 */
export async function handleSkillDebugChat(
  req: NodeApiRequest,
  res: NodeApiResponse,
  options: {
    agentSandboxPrepareActions?: SkillDebugSandboxPrepareAction[];
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

    if (messages.length === 0) {
      throw new UserError('messages is required');
    }

    const modelData = getLLMModel(model || getDefaultLLMModel().model);
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
    logger.debug('Edit debug sandbox found', { skillId, sandboxId: sandboxInstance.sandboxId });

    const chatMessages = GPTMessages2Chats({ messages });
    const userQuestion = chatMessages.pop() as UserChatItemType | undefined;
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
    const historiesWithPreview = await addPreviewUrlToChatItems(
      concatHistories(histories, chatMessages),
      'chatFlow'
    );
    const interactive = getLastInteractiveValue(historiesWithPreview);
    const userQuestionValue = removeEmptyUserInput(userQuestion.value);
    const { text: queryText = '', files: queryFiles = [] } =
      chatValue2RuntimePrompt(userQuestionValue);
    if (queryFiles.some((file) => file.url && !validateFileUrlDomain(file.url))) {
      throw new UserError('Invalid file url');
    }

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
    const getPreviewUrl = createChatFilePreviewUrlGetter();
    // preChatRound 会移除待持久化消息中的临时 URL；Agent 运行前按 key 重新签发预览地址。
    await Promise.all(
      queryFiles.map(async (file) => {
        if (!file.key) return;
        const previewUrl = await getPreviewUrl(file.key);
        if (previewUrl) file.url = previewUrl;
      })
    );

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
        currentUserValue: userQuestionValue,
        timezone: timezone ?? 'Asia/Shanghai',
        userKey: externalProvider.openaiAccount,
        modelCapabilities: {
          vision: modelData.vision,
          audio: modelData.audio,
          video: modelData.video
        }
      } satisfies SkillDebugProcessorData,
      histories: historiesWithPreview,
      usageSource: UsageSourceEnum.fastgpt,
      usageId: interactive?.usageId,
      maxFiles: SKILL_DEBUG_MAX_FILES,
      customPdfParse: false,
      processor: createSkillDebugProcessor({
        skillId,
        responseChatItemId: finalResponseChatItemId,
        isInteractiveResume: interactive?.type === 'agentAsk',
        prepareActions: options.agentSandboxPrepareActions
      }),
      onStreamContextReady: (context) => {
        streamContext = context;
      },
      onBeforeStreamDone: async ({ result, durationSeconds }) => {
        streamContext?.write(workflowSseEvent.workflowDuration(durationSeconds));

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

        const aiResponse: AIChatItemType & { dataId?: string } = {
          dataId: finalResponseChatItemId,
          obj: ChatRoleEnum.AI,
          value: result.aiResponse,
          memories: result.memories
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
  } catch (error) {
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
          error
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

    logger.error('Skill debug chat error', { error, skillId });
    if (streamContext) {
      streamContext.writeError(error);
      await streamContext.flushResume();
    } else {
      sseErrRes(res, error);
    }
  }

  res.end();
}
