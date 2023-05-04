import { modelToolMap } from '@/utils/chat';
import { ChatCompletionType, StreamResponseType } from './index';
import { ChatRoleEnum } from '@/constants/chat';
import axios from 'axios';
import mongoose from 'mongoose';
import { NEW_CHATID_HEADER } from '@/constants/chat';
import { ClaudeEnum } from '@/constants/model';

/* 模型对话 */
export const lafClaudChat = async ({
  apiKey,
  messages,
  stream,
  chatId,
  res
}: ChatCompletionType) => {
  const conversationId = chatId || String(new mongoose.Types.ObjectId());
  // create a new chat
  !chatId &&
    messages.filter((item) => item.obj === 'Human').length === 1 &&
    res?.setHeader(NEW_CHATID_HEADER, conversationId);

  // get system prompt
  const systemPrompt = messages
    .filter((item) => item.obj === 'System')
    .map((item) => item.value)
    .join('\n');
  const systemPromptText = systemPrompt ? `这是我的知识:'${systemPrompt}'\n` : '';

  const prompt = systemPromptText + messages[messages.length - 1].value;

  const lafResponse = await axios.post(
    'https://hnvacz.laf.run/claude-gpt',
    {
      prompt,
      stream,
      conversationId
    },
    {
      headers: {
        Authorization: apiKey
      },
      timeout: stream ? 40000 : 240000,
      responseType: stream ? 'stream' : 'json'
    }
  );

  let responseText = '';
  let totalTokens = 0;

  if (!stream) {
    responseText = lafResponse.data?.text || '';
  }

  return {
    streamResponse: lafResponse,
    responseMessages: messages.concat({ obj: ChatRoleEnum.AI, value: responseText }),
    responseText,
    totalTokens
  };
};

/* openai stream response */
export const lafClaudStreamResponse = async ({
  stream,
  chatResponse,
  prompts
}: StreamResponseType) => {
  try {
    let responseContent = '';

    try {
      const decoder = new TextDecoder();
      for await (const chunk of chatResponse.data as any) {
        if (stream.destroyed) {
          // 流被中断了，直接忽略后面的内容
          break;
        }
        const content = decoder.decode(chunk);
        responseContent += content;
        content && stream.push(content.replace(/\n/g, '<br/>'));
      }
    } catch (error) {
      console.log('pipe error', error);
    }
    // count tokens
    const finishMessages = prompts.concat({
      obj: ChatRoleEnum.AI,
      value: responseContent
    });
    const totalTokens = modelToolMap[ClaudeEnum.Claude].countTokens({
      messages: finishMessages
    });

    return {
      responseContent,
      totalTokens,
      finishMessages
    };
  } catch (error) {
    return Promise.reject(error);
  }
};
