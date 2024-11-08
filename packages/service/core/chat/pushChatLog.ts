import { addLog } from '../../common/system/log';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import axios from 'axios';
import { ChatItemType } from '@fastgpt/global/core/chat/type';

export type Metadata = {
  [key: string]: {
    label: string;
    value: string;
  };
};

export const pushChatLog = ({
  chatId,
  chatItemIdHuman,
  chatItemIdAi,
  appId,
  metadata
}: {
  chatId: string;
  chatItemIdHuman: string;
  chatItemIdAi: string;
  appId: string;
  metadata?: Metadata;
}) => {
  const interval = Number(process.env.CHAT_LOG_INTERVAL);
  const url = process.env.CHAT_LOG_URL;
  if (interval > 0 && url) {
    addLog.info(`[ChatLogPush] push chat log after ${interval}ms`, {
      appId,
      chatItemIdHuman,
      chatItemIdAi
    });
    setTimeout(() => {
      pushChatLogInternal({ chatId, chatItemIdHuman, chatItemIdAi, appId, url, metadata });
    }, interval);
  }
};

type ChatItem = ChatItemType & {
  userGoodFeedback?: string;
  userBadFeedback?: string;
  chatId: string;
  responseData: {
    moduleType: string;
    runningTime: number; //s
    historyPreview: { obj: string; value: string }[];
  }[];
  time: Date;
};

type ChatLog = {
  title: string;
  feedback: 'like' | 'dislike' | null;
  chatItemId: string;
  uid: string;
  question: string;
  answer: string;
  chatId: string;
  responseTime: number;
  metadata: string;
  sourceName: string;
  createdAt: number;
  sourceId: string;
};

const pushChatLogInternal = async ({
  chatId,
  chatItemIdHuman,
  chatItemIdAi,
  appId,
  url,
  metadata
}: {
  chatId: string;
  chatItemIdHuman: string;
  chatItemIdAi: string;
  appId: string;
  url: string;
  metadata?: Metadata;
}) => {
  const [chatItemHuman, chatItemAi] = await Promise.all([
    MongoChatItem.findById(chatItemIdHuman).lean() as Promise<ChatItem>,
    MongoChatItem.findById(chatItemIdAi).lean() as Promise<ChatItem>
  ]);
  const [chat] = (await MongoChat.find({ chatId }).lean()) as {
    title: string;
    outLinkUid: string | undefined;
    tmbId: string;
    teamId: string;
    metadata: Object;
    source: string;
  }[];

  // addLog.warn('ChatLogDebug', chat);
  // addLog.warn('ChatLogDebug', { chatItemHuman, chatItemAi });

  if (!chat) {
    return;
  }

  const metadataString = JSON.stringify(metadata ?? {});

  const uid = chat.outLinkUid || chat.tmbId;
  // Pop last two items
  const question = chatItemHuman.value[chatItemHuman.value.length - 1]?.text?.content;
  const answer = chatItemAi.value[chatItemAi.value.length - 1]?.text?.content;
  if (!question || !answer) {
    addLog.error('[ChatLogPush] question or answer is empty', {
      question: chatItemHuman.value,
      answer: chatItemAi.value
    });
    return;
  }
  const responseData = chatItemAi.responseData;
  let responseTime = 0;
  responseData.forEach((item) => {
    responseTime += item.runningTime;
  });

  const chatLog: ChatLog = {
    title: chat.title,
    feedback: (() => {
      if (chatItemAi.userGoodFeedback) {
        return 'like';
      } else if (chatItemAi.userBadFeedback) {
        return 'dislike';
      } else {
        return null;
      }
    })(),
    chatItemId: `${chatItemIdHuman},${chatItemIdAi}`,
    uid,
    question,
    answer,
    chatId,
    responseTime: responseTime * 1000,
    metadata: metadataString,
    sourceName: chat.source ?? '-',
    createdAt: new Date(chatItemAi.time).getTime(),
    sourceId: `crbeer-fastgpt-${appId}`
  };
  await axios
    .post(url + '/api/chat/push', chatLog)
    .then((res) => {
      addLog.info('[ChatLogPush] push success', res.data);
    })
    .catch((e) => {
      addLog.error('[ChatLogPush] push failed', { e, resData: e.response?.data });
    });
};
