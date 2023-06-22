import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import type { ChatModelItemType } from '@/constants/model';
import { ChatModelMap, OpenAiChatEnum } from '@/constants/model';
import { connectToDatabase } from '@/service/mongo';
import { OpenAIKey } from '@/service/models/openaiKey';

// get the models available to the system
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const chatModelList: ChatModelItemType[] = [];

  await connectToDatabase();

  const mongoKey3 = await OpenAIKey.findOne({ active: true, isGPT4: false });
  const mongoKey4 = await OpenAIKey.findOne({ active: true, isGPT4: true });

  if (global.systemEnv.openAIKeys || mongoKey3) {
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT3516k]);
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT35]);
  }
  if (global.systemEnv.gpt4Key || mongoKey4) {
    chatModelList.push(ChatModelMap[OpenAiChatEnum.GPT4]);
  }

  jsonRes(res, {
    data: chatModelList
  });
}
