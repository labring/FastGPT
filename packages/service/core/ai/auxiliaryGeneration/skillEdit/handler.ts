import type { NextApiRequest, NextApiResponse } from 'next';
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
import { runAuxiliaryGeneration, type AuxiliaryGenerationStreamContext } from '..';
import { SKILL_EDIT_MAX_FILES } from './userContext';
import type { AgentSandboxPrepareAction } from '../../sandbox/interface/runtime';
import { createSkillEditProcessor, type SkillEditProcessorData } from './processor';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

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
    await addPreviewUrlToChatItems(newHistories, 'chatFlow');
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
    // preChatRound 会清理待持久化消息中的临时 URL；运行时需在其后按 key 重新生成。
    await Promise.all(
      queryFiles.map(async (file) => {
        if (!file.key) return;
        file.url = await getPreviewUrl(file.key);
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
      processor: createSkillEditProcessor({
        skillId,
        responseChatItemId: finalResponseChatItemId,
        isInteractiveResume: interactive?.type === 'agentPlanAskQuery',
        hasCurrentFiles: queryFiles.length > 0,
        modelCapabilities: {
          vision: modelData.vision,
          audio: modelData.audio,
          video: modelData.video
        },
        prepareActions: options.agentSandboxPrepareActions
      }),
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
