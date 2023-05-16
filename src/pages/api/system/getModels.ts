import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import type { ChatModelItemType } from '@/constants/model';
import { ChatModelMap, OpenAiChatEnum, ClaudeEnum } from '@/constants/model';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const chatModelList: ChatModelItemType[] = [];

  if (process.env.OPENAIKEY) {
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT35]);
  }
  if (process.env.GPT4KEY) {
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT4]);
  }
  if (process.env.CLAUDE_KEY) {
    chatModelList.push(ChatModelMap[ClaudeEnum.Claude]);
  }

  jsonRes(res, {
    data: chatModelList
  });
}
