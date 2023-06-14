import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import type { ChatModelItemType } from '@/constants/model';
import { ChatModelMap, OpenAiChatEnum } from '@/constants/model';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const chatModelList: ChatModelItemType[] = [];

  if (global.systemEnv.openAIKeys) {
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT3516k]);
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT35]);
  }
  if (global.systemEnv.gpt4Key) {
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT4]);
  }

  jsonRes(res, {
    data: chatModelList
  });
}
