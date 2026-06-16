import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { writePrimary } from '../../../common/mongo/utils';
import { MongoChatItem } from '../chatItemSchema';
import { MongoChat } from '../chatSchema';
import { tryStartGenerateChat, updateChatGenerateStatus } from '../chatGenerateStatus';
import { validateChatRoundDataIds } from './dataIdValidation';
import { getInteractiveResponseStatus } from '../interactiveResponseDataId';
import {
  canWriteGeneratedTitle,
  syncGeneratedChatTitleFromUserContent,
  type GeneratedChatTitleResult
} from '../title';

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

export type EnsurePendingChatRoundParams = {
  chatId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  userContent: UserChatItemType & { dataId?: string };
  responseChatItemId: string;
};

export type PrepareChatRoundParams = {
  chatId: string;
  appId: string;
  teamId: string;
  tmbId: string;
  source: `${ChatSourceEnum}`;
  sourceName?: string;
  shareId?: string;
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
  fixedTitle?: string;
};

export type PreChatRoundResult = {
  chatId: string;
  responseChatItemId: string;
  shouldPersistChatRound: boolean;
  shouldFinalizePreparedRound: boolean;
  titleGeneration?: Promise<GeneratedChatTitleResult | undefined>;
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
  const {
    chatId,
    appId,
    teamId,
    tmbId,
    source,
    sourceName,
    shareId,
    outLinkUid,
    responseChatItemId
  } = params;

  if (isSkipSaveChatId(chatId)) {
    return {
      shouldGenerateTitle: false
    };
  }

  stripUserContentFileUrls(params.userContent);
  params.userContent.dataId = responseChatItemId;
  const now = new Date();

  const userPayload: UserChatItemType & { dataId: string; obj: typeof ChatRoleEnum.Human } = {
    ...params.userContent,
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
    const previousChat = await MongoChat.findOneAndUpdate(
      {
        appId,
        chatId
      },
      {
        $set: {
          teamId,
          tmbId,
          appId,
          chatId,
          source,
          sourceName,
          shareId,
          outLinkUid,
          updateTime: now,
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating
        },
        $setOnInsert: {
          createTime: now
        }
      },
      {
        session,
        upsert: true,
        new: false
      }
    )
      .select('title customTitle')
      .lean();

    shouldGenerateTitle = canWriteGeneratedTitle(previousChat);

    await MongoChatItem.create(
      [
        {
          teamId,
          tmbId,
          chatId,
          appId,
          ...userPayload
        },
        {
          teamId,
          tmbId,
          chatId,
          appId,
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
 * 它负责解析最终 chatId/responseChatItemId、占用生成槽、检查 AI dataId 冲突，并在
 * 需要持久化时预创建本轮 Human/AI placeholder。失败时如果已经占用生成槽，会立刻将
 * chatGenerateStatus 标记为 error，避免会话长期停留在 generating。
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

  if (!shouldPersistChatRound) {
    return {
      chatId,
      responseChatItemId,
      shouldPersistChatRound: false,
      shouldFinalizePreparedRound: false
    };
  }

  const canStartGenerate = await tryStartGenerateChat({
    appId: params.appId,
    chatId,
    teamId: params.teamId,
    tmbId: params.tmbId,
    source: params.source,
    sourceName: params.sourceName,
    shareId: params.shareId,
    outLinkUid: params.outLinkUid
  });

  if (!canStartGenerate) {
    throw ChatErrEnum.chatIsGenerating;
  }

  try {
    if (isInteractiveContinue) {
      const previousAiItem = await MongoChatItem.findOne(
        {
          appId: params.appId,
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

      return {
        chatId,
        responseChatItemId: previousAiItem.dataId,
        shouldPersistChatRound: true,
        shouldFinalizePreparedRound: false
      };
    }

    await validateChatRoundDataIds({
      appId: params.appId,
      chatId,
      userContent: params.userContent,
      responseChatItemId
    });

    const preparedChatRound = await prepareChatRound({
      ...params,
      chatId,
      responseChatItemId
    });

    const titleGeneration = syncGeneratedChatTitleFromUserContent({
      appId: params.appId,
      chatId,
      userContent: params.userContent,
      shouldGenerateTitle: preparedChatRound.shouldGenerateTitle,
      fixedTitle: params.fixedTitle
    });

    return {
      chatId,
      responseChatItemId,
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true,
      titleGeneration
    };
  } catch (error) {
    await updateChatGenerateStatus({
      appId: params.appId,
      chatId,
      status: ChatGenerateStatusEnum.error
    });
    throw error;
  }
};
