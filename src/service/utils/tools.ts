import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ChatItemSimpleType } from '@/types/chat';
import { countChatTokens, sliceTextByToken } from '@/utils/tools';
import { ChatCompletionRequestMessageRoleEnum, ChatCompletionRequestMessage } from 'openai';
import type { ChatModelType } from '@/constants/model';

/* 密码加密 */
export const hashPassword = (psw: string) => {
  return crypto.createHash('sha256').update(psw).digest('hex');
};

/* 生成 token */
export const generateToken = (userId: string) => {
  const key = process.env.TOKEN_KEY as string;
  const token = jwt.sign(
    {
      userId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    key
  );
  return token;
};

/* openai axios config */
export const axiosConfig = () => ({
  httpsAgent: global.httpsAgent,
  headers: {
    auth: process.env.OPENAI_BASE_URL_AUTH || ''
  }
});

/* delete invalid symbol */
const simplifyStr = (str: string) =>
  str
    .replace(/\n+/g, '\n') // 连续空行
    .replace(/[^\S\r\n]+/g, ' ') // 连续空白内容
    .trim();

/* 聊天内容 tokens 截断 */
export const openaiChatFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: ChatModelType;
  prompts: ChatItemSimpleType[];
  maxTokens: number;
}) => {
  // role map
  const map = {
    Human: ChatCompletionRequestMessageRoleEnum.User,
    AI: ChatCompletionRequestMessageRoleEnum.Assistant,
    SYSTEM: ChatCompletionRequestMessageRoleEnum.System
  };

  let rawTextLen = 0;
  const formatPrompts = prompts.map((item) => {
    const val = simplifyStr(item.value);
    rawTextLen += val.length;
    return {
      role: map[item.obj],
      content: val
    };
  });

  // 长度太小时，不需要进行 token 截断
  if (rawTextLen < maxTokens * 0.5) {
    return formatPrompts;
  }

  // 根据 tokens 截断内容
  const chats: ChatCompletionRequestMessage[] = [];
  let systemPrompt: ChatCompletionRequestMessage | null = null;

  //  System 词保留
  if (formatPrompts[0]?.role === 'system') {
    systemPrompt = formatPrompts.shift() as ChatCompletionRequestMessage;
  }

  let messages: { role: ChatCompletionRequestMessageRoleEnum; content: string }[] = [];

  // 从后往前截取对话内容
  for (let i = formatPrompts.length - 1; i >= 0; i--) {
    chats.unshift(formatPrompts[i]);

    messages = systemPrompt ? [systemPrompt, ...chats] : chats;

    const tokens = countChatTokens({
      model,
      messages
    });

    /* 整体 tokens 超出范围 */
    if (tokens >= maxTokens) {
      return systemPrompt ? [systemPrompt, ...chats.slice(1)] : chats.slice(1);
    }
  }

  return messages;
};

/* system 内容截断. 相似度从高到低 */
export const systemPromptFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: 'gpt-4' | 'gpt-4-32k' | 'gpt-3.5-turbo';
  prompts: string[];
  maxTokens: number;
}) => {
  const systemPrompt = prompts.join('\n');

  return sliceTextByToken({
    model,
    text: systemPrompt,
    length: maxTokens
  });
};
