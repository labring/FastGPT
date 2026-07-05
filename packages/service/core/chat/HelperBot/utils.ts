import type {
  AIChatItemType,
  AIChatItemValueItemType,
  UserChatItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import {
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { HelperBotChatFileType } from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoChat } from '../chatSchema';
import { MongoChatItem } from '../chatItemSchema';
import { buildChatSourceQuery } from '../source';
import { finalizeChatRound, persistChatFiles } from '../saveChat';
import { createChatFilePreviewUrlGetter } from '../../../common/s3/sources/chat';
import { isAuthorizedChatFileS3Key } from '../../../common/s3/sources/chat/key';

const parseUserInputValue = (query: string) => {
  try {
    const result = JSON.parse(query);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
  } catch {}
};

/**
 * 从通用 ChatBox 提交的 messages 中解析 HelperBot 运行输入。
 *
 * HelperBot 不再定义单独的请求结构；Human 消息的 dataId、文本和文件
 * 都直接来自 ChatBox 的最后一条 user message，保证刷新后回显使用同一套记录字段。
 */
export const parseHelperBotChatBoxMessages = (messages: ChatCompletionMessageParam[]) => {
  const lastUserMessage = messages.findLast((message) => message.role === 'user');
  if (!lastUserMessage?.dataId) {
    throw new Error('HelperBot human message dataId is empty');
  }

  const content = lastUserMessage.content;
  const value: UserChatItemValueItemType[] = [];
  if (typeof content === 'string') {
    if (content) {
      value.push({
        text: {
          content
        }
      });
    }

    return {
      userContent: {
        dataId: lastUserMessage.dataId,
        obj: ChatRoleEnum.Human as typeof ChatRoleEnum.Human,
        hideInUI: lastUserMessage.hideInUI,
        value
      },
      query: content,
      files: [] as HelperBotChatFileType[]
    };
  }

  const files: HelperBotChatFileType[] = [];
  const query = content
    .map((item) => {
      if (item.type === 'text') {
        value.push({
          text: {
            content: item.text
          }
        });
        return item.text;
      }

      if (item.type === 'image_url') {
        const file = {
          type: ChatFileTypeEnum.image,
          key: item.key || '',
          name: '',
          url: item.image_url.url
        };
        files.push(file);
        value.push({
          file: {
            type: file.type,
            name: file.name,
            url: file.url,
            key: file.key
          }
        });
        return;
      }

      if (item.type === 'file_url') {
        const file = {
          type: (item.fileType as ChatFileTypeEnum | undefined) ?? ChatFileTypeEnum.file,
          key: item.key || '',
          name: item.name || '',
          url: item.url
        };
        files.push(file);
        value.push({
          file: {
            type: file.type,
            name: file.name,
            url: file.url,
            key: file.key
          }
        });
      }
    })
    .filter((text): text is string => typeof text === 'string')
    .join('\n');

  return {
    userContent: {
      dataId: lastUserMessage.dataId,
      obj: ChatRoleEnum.Human as typeof ChatRoleEnum.Human,
      hideInUI: lastUserMessage.hideInUI,
      value
    },
    query,
    files
  };
};

type ResolveAuthorizedHelperBotFilesParams = {
  files: HelperBotChatFileType[];
  sourceId: string;
  uid: string;
  chatId: string;
  getPreviewUrl?: (key: string) => Promise<string>;
};

/**
 * 校验并解析 HelperBot 上传文件。
 *
 * HelperBot completions 只能消费当前 helperBot chat source 下、当前成员上传的 chat file key。
 * 客户端传入的 url 不可信，这里统一丢弃并由服务端按授权后的 key 重新签预览链接。
 */
export const resolveAuthorizedHelperBotFiles = async ({
  files,
  sourceId,
  uid,
  chatId,
  getPreviewUrl = createChatFilePreviewUrlGetter()
}: ResolveAuthorizedHelperBotFilesParams) => {
  return Promise.all(
    files.map(async (file) => {
      if (
        !isAuthorizedChatFileS3Key({
          key: file.key,
          sourceType: ChatSourceTypeEnum.helperBot,
          sourceId,
          uid,
          chatId
        })
      ) {
        return Promise.reject(ChatErrEnum.unAuthChat);
      }

      return {
        ...file,
        url: await getPreviewUrl(file.key)
      };
    })
  );
};

const applyUserInputInteractiveValue = ({
  aiValue,
  query
}: {
  aiValue: AIChatItemValueItemType[];
  query: string;
}) => {
  const formData = parseUserInputValue(query);
  if (!formData) return false;

  const updateInputForm = <T extends { type: FlowNodeInputTypeEnum; key: string; value: any }>(
    inputForm: T[]
  ) =>
    inputForm.map((item) => {
      const value = formData[item.key];
      if (value === undefined) return item;

      if (item.type === FlowNodeInputTypeEnum.fileSelect && Array.isArray(value)) {
        return {
          ...item,
          value: value.map((file) =>
            file && typeof file === 'object'
              ? {
                  name: 'name' in file ? file.name : undefined,
                  url: 'url' in file ? file.url : undefined
                }
              : file
          )
        };
      }

      return {
        ...item,
        value
      };
    });

  const interactiveIndex = aiValue.findLastIndex(
    (item) => 'interactive' in item && !!item.interactive
  );
  if (interactiveIndex === -1) return false;

  const interactiveValue = aiValue[interactiveIndex];
  if (!('interactive' in interactiveValue) || !interactiveValue.interactive) return false;
  const interactive = extractDeepestInteractive(interactiveValue.interactive);
  if (interactive.type !== 'userInput') return false;

  interactive.params.inputForm = updateInputForm(interactive.params.inputForm);
  interactive.params.submitted = true;
  return true;
};

/**
 * 保存 HelperBot 一轮输出。
 *
 * 普通新一轮的 pending Human/AI 由通用 preChatRound 创建，这里只负责 finalize。
 * interactive 续写不创建新 Human/AI item，而是回填原 AI item 的表单状态并 append 新响应。
 */
export const pushChatRecords = async ({
  teamId,
  tmbId,
  sourceId,
  chatId,
  userContent,
  query,
  responseChatItemId,
  shouldFinalizePreparedRound,
  aiResponse,
  durationSeconds,
  memories,
  metadata
}: {
  teamId: string;
  tmbId: string;
  sourceId: string;
  chatId: string;
  userContent: UserChatItemType & { dataId?: string };
  query: string;
  responseChatItemId: string;
  shouldFinalizePreparedRound: boolean;
  aiResponse: AIChatItemValueItemType[];
  durationSeconds?: number;
  memories?: Record<string, any>;
  metadata?: Record<string, any>;
}) => {
  const now = new Date();
  const chatSource = {
    sourceType: ChatSourceTypeEnum.helperBot,
    sourceId
  };

  if (shouldFinalizePreparedRound) {
    await finalizeChatRound({
      teamId,
      tmbId,
      sourceType: ChatSourceTypeEnum.helperBot,
      sourceId,
      chatId,
      nodes: [],
      source: ChatSourceEnum.test,
      sourceName: 'HelperBot',
      userContent,
      aiContent: {
        dataId: responseChatItemId,
        obj: ChatRoleEnum.AI,
        value: aiResponse,
        memories
      },
      durationSeconds: durationSeconds ?? 0,
      metadata
    });
    return;
  }

  const chat = await MongoChat.findOne(
    {
      ...buildChatSourceQuery(chatSource),
      chatId
    },
    '_id metadata'
  ).lean();
  const metadataUpdate = {
    ...chat?.metadata,
    ...metadata
  };

  await mongoSessionRun(async (session) => {
    const persistCurrentRoundFiles = () => {
      const contents: (UserChatItemType | AIChatItemType)[] = [
        userContent,
        {
          obj: ChatRoleEnum.AI,
          value: aiResponse
        }
      ];

      return persistChatFiles({
        contents,
        session
      });
    };

    const existingAiItem = await MongoChatItem.findOne({
      ...buildChatSourceQuery(chatSource),
      chatId,
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI
    }).session(session);

    if (!existingAiItem) {
      throw new Error(`HelperBot interactive chat item not found: ${chatId}/${responseChatItemId}`);
    }

    const existingAiRecord = existingAiItem as typeof existingAiItem & {
      value: AIChatItemValueItemType[];
      memories?: Record<string, any>;
      durationSeconds?: number;
    };
    const nextValue = existingAiRecord.value;
    const hasSubmittedInteractive = applyUserInputInteractiveValue({
      aiValue: nextValue,
      query
    });
    if (!hasSubmittedInteractive) {
      throw new Error(`HelperBot interactive form not found: ${chatId}/${responseChatItemId}`);
    }

    existingAiRecord.value = [...nextValue, ...aiResponse];
    existingAiRecord.memories = {
      ...existingAiRecord.memories,
      ...memories
    };
    if (typeof durationSeconds === 'number') {
      existingAiRecord.durationSeconds = existingAiRecord.durationSeconds
        ? +(existingAiRecord.durationSeconds + durationSeconds).toFixed(2)
        : durationSeconds;
    }
    existingAiRecord.markModified('value');
    existingAiRecord.markModified('memories');
    await existingAiRecord.save({ session });

    await MongoChat.updateOne(
      {
        ...buildChatSourceQuery(chatSource),
        chatId
      },
      {
        $set: {
          updateTime: now,
          metadata: metadataUpdate,
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          hasBeenRead: false
        }
      },
      {
        session
      }
    );
    await persistCurrentRoundFiles();
  });
};
