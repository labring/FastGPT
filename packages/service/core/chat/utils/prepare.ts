import type { ChatPublishSourceType } from '@fastgpt/global/core/chat/publishSource/type';
import { updateChatPublishSource } from '../publishSource/service';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { writePrimary } from '../../../common/mongo/utils';
import { MongoChatItem } from '../chatItemSchema';
import { MongoChat } from '../chatSchema';
import { validateChatRoundDataIds } from './dataIdValidation';
import { getInteractiveResponseStatus } from '../interactiveResponseDataId';
import { canWriteGeneratedTitle, syncGeneratedChatTitleFromUserContent } from '../title';
import { buildChatSourceQuery, buildChatSourceWriteFields, type ChatSourceParams } from '../source';
import { tryStartChatGenerationLease } from '../generationLease';
import { delAgentRuntimeStopSign } from '../stop';
import { checkEntryModeration, markEntryModerationChecked } from '../../plugin/moderation/entry';

export const NO_RECORD_CHAT_ID = 'NO_RECORD_HISTORIES';

/** 判断当前 chatId 是否为不落库的运行标记。 */
export const isSkipSaveChatId = (chatId?: string) => chatId === NO_RECORD_CHAT_ID;

const resolvePreChatRoundChatId = (chatId?: string) =>
  chatId === NO_RECORD_CHAT_ID ? chatId : chatId || getNanoid(24);

/**
 * 清理用户消息里的文件临时 URL，只保留 file key 参与持久化。
 *
 * 文件已经通过 key 持久化，URL 可能带 TTL 或签名信息，写入 chat item 会导致历史记录中保存
 * 过期访问地址。
 */
export const stripUserContentFileUrls = (userContent: UserChatItemType & { dataId?: string }) => {
  userContent.value.forEach((item) => {
    if (item.file?.key) {
      item.file.url = '';
    }
  });
};

export type EnsurePendingChatRoundParams = ChatSourceParams & {
  chatId: string;
  teamId: string;
  tmbId: string;
  userContent: UserChatItemType & { dataId?: string };
  responseChatItemId: string;
};

export type PrepareChatRoundParams = ChatSourceParams & {
  chatId: string;
  teamId: string;
  tmbId: string;
  source: `${ChatSourceEnum}`;
  publishSource?: ChatPublishSourceType;
  sourceName?: string;
  outLinkUid?: string;
  userContent: UserChatItemType & { dataId?: string };
  responseChatItemId: string;
};

export type PrepareChatRoundResult = {
  shouldGenerateTitle: boolean;
};

export type PreChatRoundParams = Omit<PrepareChatRoundParams, 'chatId' | 'responseChatItemId'> & {
  chatId?: string;
  responseChatItemId?: string;
  interactive?: WorkflowInteractiveResponseType;
  variables?: Record<string, any>;
  requestId?: string;
  fixedTitle?: string;
  /** 固定标题语言；无请求上下文的入口缺省并由标题模块回退 zh-CN。 */
  locale?: localeType;
};

export type PreChatRoundResult = {
  publishSource?: ChatPublishSourceType;
  chatId: string;
  responseChatItemId: string;
  /** 请求退出时释放独立续租；不持久化或向 workflow 传递租约身份。 */
  releaseGenerationLease?: () => Promise<void>;
  shouldPersistChatRound: boolean;
  shouldFinalizePreparedRound: boolean;
  titleGeneration?: Promise<string | undefined>;
};

/**
 * 读取预创建 Human/AI chat items 的 dataId。
 *
 * 新运行要求 prepare 阶段已经为本轮 Human/AI 创建同一个 dataId；缺失说明调用方绕过了
 * preChatRound 或传入内容被错误覆盖，应直接失败，避免后续误写新记录。
 */
export const getPreparedRoundDataIds = ({
  userContent,
  aiContent
}: {
  userContent: UserChatItemType & { dataId?: string };
  aiContent: AIChatItemType & { dataId?: string };
}) => {
  if (!userContent.dataId) {
    throw new Error('Pending chat round human dataId is missing');
  }
  if (!aiContent.dataId) {
    throw new Error('Pending chat round ai dataId is missing');
  }

  return {
    humanDataId: userContent.dataId,
    aiDataId: aiContent.dataId
  };
};

/**
 * 预创建一轮可保存的 Human/AI chat items。
 *
 * 这里使用严格 create，不再使用 upsert。调用方必须先确认 AI dataId 未被使用；
 * Human 和 AI 使用同一个 roundDataId，便于客户端与服务端用一轮消息 ID 对齐。
 */
export const prepareChatRound = async (
  params: PrepareChatRoundParams
): Promise<PrepareChatRoundResult> => {
  const { chatId, teamId, tmbId, responseChatItemId } = params;
  const chatSource = {
    sourceType: params.sourceType,
    sourceId: params.sourceId
  };
  const sourceWriteFields = buildChatSourceWriteFields(chatSource);

  if (isSkipSaveChatId(chatId)) {
    return {
      shouldGenerateTitle: false
    };
  }

  params.userContent.dataId = responseChatItemId;
  const userPayload: UserChatItemType & { dataId: string; obj: typeof ChatRoleEnum.Human } = {
    ...params.userContent,
    value: params.userContent.value.map((item) => ({
      ...item,
      ...(item.file?.key ? { file: { ...item.file, url: '' } } : {})
    })),
    dataId: responseChatItemId,
    obj: ChatRoleEnum.Human
  };

  const aiPlaceholder: AIChatItemType & { dataId: string } = {
    dataId: responseChatItemId,
    obj: ChatRoleEnum.AI,
    value: []
  };

  let shouldGenerateTitle = false;

  await mongoSessionRun(async (session) => {
    const previousChat = await MongoChat.findOne({ ...buildChatSourceQuery(chatSource), chatId })
      .select('title customTitle')
      .session(session)
      .lean();
    if (!previousChat) throw new Error(`Chat was not initialized by preChatRound: ${chatId}`);

    shouldGenerateTitle = canWriteGeneratedTitle(previousChat);

    await MongoChatItem.create(
      [
        {
          teamId,
          tmbId,
          chatId,
          ...sourceWriteFields,
          ...userPayload
        },
        {
          teamId,
          tmbId,
          chatId,
          ...sourceWriteFields,
          ...aiPlaceholder
        }
      ],
      { session, ordered: true, ...writePrimary }
    );
  });

  return {
    shouldGenerateTitle
  };
};

/**
 * 业务入口进入 workflow 前的唯一准备方法。
 *
 * 它负责解析最终 chatId/responseChatItemId、获取 Redis 生成租约、检查 AI dataId 冲突，
 * 并在需要持久化时预创建本轮 Human/AI placeholder。仅明确占用时拦截，租约获取异常降级放行。
 * 准备失败立即释放已获取的租约；
 * 成功时将释放函数交给请求 finally，Mongo 不持久化运行状态。
 */
export const preChatRound = async (params: PreChatRoundParams): Promise<PreChatRoundResult> => {
  const chatId = resolvePreChatRoundChatId(params.chatId);
  const responseChatItemId = params.responseChatItemId || getNanoid(24);
  const shouldPersistChatRound = !isSkipSaveChatId(chatId);
  const interactiveStatus = getInteractiveResponseStatus({
    interactive: params.interactive,
    userContent: params.userContent
  });
  const isInteractiveContinue = !!params.interactive && interactiveStatus !== 'query';

  // 入口审核必须在获取生成租约和落库 Human/AI 占位消息之前执行：违规直接拒绝，不产生任何会话或消息持久化。
  await checkEntryModeration({
    query: params.userContent.value,
    variables: params.variables,
    context: {
      teamId: params.teamId,
      tmbId: params.tmbId,
      appId: params.sourceId,
      chatId,
      responseChatItemId,
      requestId: params.requestId
    }
  });
  markEntryModerationChecked({
    chatId,
    responseChatItemId,
    variablesChecked: params.variables !== undefined
  });

  if (!shouldPersistChatRound) {
    // 不落库的入口没有 lease，在准备阶段重置旧信号；执行器启动后不再清理主动停止。
    await delAgentRuntimeStopSign({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      chatId
    });
    return {
      chatId,
      responseChatItemId,
      shouldPersistChatRound: false,
      shouldFinalizePreparedRound: false
    };
  }

  const releaseGenerationLease = await tryStartChatGenerationLease({
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    chatId,
    responseChatItemId,
    reusePreviousAi: isInteractiveContinue
  });
  if (!releaseGenerationLease) throw ChatErrEnum.chatIsGenerating;

  try {
    if (isInteractiveContinue) {
      const previousAiItem = await MongoChatItem.findOne(
        {
          ...buildChatSourceQuery({ sourceType: params.sourceType, sourceId: params.sourceId }),
          chatId,
          obj: ChatRoleEnum.AI
        },
        'dataId'
      )
        .sort({ _id: -1 })
        .lean()
        .exec();

      if (!previousAiItem?.dataId) {
        throw new Error(`Interactive continue chat item not found: ${chatId}`);
      }

      // 交互续跑复用原 AI，先确认记录有效，再在 preChat 中记录本次来源。
      const publishSource = await updateChatPublishSource({ ...params, chatId });

      return {
        chatId,
        responseChatItemId: previousAiItem.dataId,
        releaseGenerationLease,
        publishSource,
        shouldPersistChatRound: true,
        shouldFinalizePreparedRound: false
      };
    }

    await validateChatRoundDataIds({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      chatId,
      userContent: params.userContent,
      responseChatItemId
    });

    const publishSource = await updateChatPublishSource({ ...params, chatId });

    const preparedChatRound = await prepareChatRound({
      ...params,
      chatId,
      responseChatItemId
    });

    const titleGeneration = (() => {
      if (!preparedChatRound.shouldGenerateTitle) return;

      return syncGeneratedChatTitleFromUserContent({
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        chatId,
        teamId: params.teamId,
        userContent: params.userContent,
        shouldGenerateTitle: preparedChatRound.shouldGenerateTitle,
        fixedTitle: params.fixedTitle,
        locale: params.locale
      });
    })();

    return {
      chatId,
      responseChatItemId,
      releaseGenerationLease,
      publishSource,
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true,
      titleGeneration
    };
  } catch (error) {
    await releaseGenerationLease();
    throw error;
  }
};
