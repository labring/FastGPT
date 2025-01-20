import type { NextApiResponse } from 'next';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps<{}, { bufferId?: string }>, res: NextApiResponse) {
  const { bufferId } = req.query;

  // If bufferId is the same as the current bufferId, return directly
  if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
    return {
      bufferId: global.systemInitBufferId,
      systemVersion: global.systemVersion || '0.0.0'
    };
  }

  return {
    bufferId: global.systemInitBufferId,
    feConfigs: global.feConfigs,
    subPlans: global.subPlans,
    llmModels: global.llmModels.map((model) => ({
      ...model,
      customCQPrompt: '',
      customExtractPrompt: '',
      defaultSystemChatPrompt: ''
    })),
    vectorModels: global.vectorModels,
    reRankModels:
      global.reRankModels?.map((item) => ({
        ...item,
        requestUrl: '',
        requestAuth: ''
      })) || [],
    whisperModel: global.whisperModel,
    audioSpeechModels: global.audioSpeechModels,
    systemVersion: global.systemVersion || '0.0.0'
  };
}

export default NextAPI(handler);
