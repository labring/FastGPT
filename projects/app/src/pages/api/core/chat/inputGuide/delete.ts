import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';

export type deleteChatInputGuideQuery = {};

export type deleteInputGuideBody = { appId: string; dataIdList: string[] };

export type deleteInputGuideResponse = {};

async function handler(
  req: ApiRequestProps<deleteInputGuideBody, deleteChatInputGuideQuery>,
  res: ApiResponseType<any>
): Promise<deleteInputGuideResponse> {
  const { appId, dataIdList } = req.body;
  await authApp({ req, appId, authToken: true, per: 'r' });
  console.log(dataIdList);
  await MongoChatInputGuide.deleteMany({
    _id: { $in: dataIdList },
    appId
  });

  return {};
}

export default NextAPI(handler);
