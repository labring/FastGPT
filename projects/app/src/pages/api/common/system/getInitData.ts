import type { NextApiResponse } from 'next';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: ApiRequestProps<{}, { bufferId?: string }>, res: NextApiResponse) {
  const { bufferId } = req.query;

  const activeModelList = global.systemActiveModelList.map((model) => ({
    ...model,
    customCQPrompt: undefined,
    customExtractPrompt: undefined,
    defaultSystemChatPrompt: undefined,
    fieldMap: undefined,
    defaultConfig: undefined,
    weight: undefined,
    dbConfig: undefined,
    queryConfig: undefined,
    requestUrl: undefined,
    requestAuth: undefined
  }));

  // If bufferId is the same as the current bufferId, return directly
  if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
    return {
      bufferId: global.systemInitBufferId,
      activeModelList,
      systemVersion: global.systemVersion || '0.0.0'
    };
  }

  return {
    bufferId: global.systemInitBufferId,
    feConfigs: global.feConfigs,
    subPlans: global.subPlans,
    activeModelList,
    systemVersion: global.systemVersion || '0.0.0'
  };
}

export default NextAPI(handler);
