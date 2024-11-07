import { addLog } from '../../common/system/log';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import axios from 'axios';
import { ChatItemType } from '@fastgpt/global/core/chat/type';

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

export const pushChatLog = async ({ chatItemId, appId }: { chatItemId: string; appId: string }) => {
  const url = process.env.CHAT_LOG_URL;
  if (!url) {
    return;
  }
  const chatItem = (await MongoChatItem.findById(chatItemId)) as ChatItemType & {
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
  if (!chatItem) {
    return;
  }
  const [chat] = (await MongoChat.find({ chatId: chatItem.chatId }).lean()) as {
    title: string;
    outLinkUid: string | undefined;
    tmbId: string;
    teamId: string;
    metadata: Object;
    source: string;
  }[];

  // addLog.info('ChatLogDebug', chat);
  // addLog.info('ChatLogDebug', chatItem);

  if (!chat) {
    return;
  }

  const uid = chat.outLinkUid || chat.tmbId;
  const qas =
    chatItem.responseData
      .find((item) => item.moduleType === 'chatNode')
      ?.historyPreview.map((item) => item.value) ?? [];
  // Pop last two items
  const answer = qas.pop();
  const question = qas.pop();
  if (!question || !answer) {
    return;
  }

  const chatLog: ChatLog = {
    title: chat.title,
    feedback: (() => {
      if (chatItem.userGoodFeedback) {
        return 'like';
      } else if (chatItem.userBadFeedback) {
        return 'dislike';
      } else {
        return null;
      }
    })(),
    chatItemId: chatItemId,
    uid,
    question,
    answer,
    chatId: chatItem.chatId,
    responseTime:
      (chatItem.responseData.find((item) => item.moduleType === 'chatNode')?.runningTime ?? 0) *
      1000,
    metadata: '{}', // TODO: chat.metadata,
    sourceName: chat.source ?? '-',
    createdAt: new Date(chatItem.time).getTime(),
    sourceId: `crbeer-fastgpt-${appId}`
  };
  const result = await axios.post(url + '/api/chat/push', chatLog).catch((e) => {
    addLog.error('[ChatLogPush ] push failed', { e, resData: e.response?.data });
  });
  addLog.info('[ChatLogPush] push success', result?.data);
};
