import { addLog } from '../../common/system/log';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import axios from 'axios';
import { AIChatItemType, ChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

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
  if (!isNaN(interval) && interval > 0 && url) {
    addLog.debug(`[ChatLogPush] push chat log after ${interval}ms`, {
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
  try {
    const [chatItemHuman, chatItemAi] = await Promise.all([
      MongoChatItem.findById(chatItemIdHuman).lean() as Promise<UserChatItemType>,
      MongoChatItem.findById(chatItemIdAi).lean() as Promise<AIChatItemType>
    ]);

    if (!chatItemHuman || !chatItemAi) {
      return;
    }

    const chat = await MongoChat.findOne({ chatId }).lean();

    // addLog.warn('ChatLogDebug', chat);
    // addLog.warn('ChatLogDebug', { chatItemHuman, chatItemAi });

    if (!chat) {
      return;
    }

    const metadataString = JSON.stringify(metadata ?? {});

    const uid = chat.outLinkUid || chat.tmbId;
    // Pop last two items
    const question = chatItemHuman.value
      .map((item) => {
        if (item.type === ChatItemValueTypeEnum.text) {
          return item.text?.content;
        } else if (item.type === ChatItemValueTypeEnum.file) {
          if (item.file?.type === 'image') {
            return `![${item.file?.name}](${item.file?.url})`;
          }
          return `[${item.file?.name}](${item.file?.url})`;
        }
        return '';
      })
      .join('\n');
    const answer = chatItemAi.value
      .map((item) => {
        const text = [];
        if (item.text?.content) {
          text.push(item.text?.content);
        }
        if (item.tools) {
          text.push(
            item.tools.map(
              (tool) =>
                `\`\`\`json
${JSON.stringify(
  {
    name: tool.toolName,
    params: tool.params,
    response: tool.response
  },
  null,
  2
)}
\`\`\``
            )
          );
        }
        if (item.interactive) {
          text.push(`\`\`\`json
${JSON.stringify(item.interactive, null, 2)}
            \`\`\``);
        }
        return text.join('\n');
      })
      .join('\n');

    if (!question || !answer) {
      addLog.error('[ChatLogPush] question or answer is empty', {
        question: chatItemHuman.value,
        answer: chatItemAi.value
      });
      return;
    }

    // computed response time
    const responseData = chatItemAi.responseData;
    const responseTime =
      responseData?.reduce((acc, item) => acc + (item?.runningTime ?? 0), 0) || 0;

    const sourceIdPrefix = process.env.CHAT_LOG_SOURCE_ID_PREFIX ?? 'fastgpt-';

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
      // @ts-ignore
      createdAt: new Date(chatItemAi.time).getTime(),
      sourceId: `${sourceIdPrefix}${appId}`
    };
    await axios.post(`${url}/api/chat/push`, chatLog);
  } catch (e) {
    addLog.error('[ChatLogPush] error', e);
  }
};
