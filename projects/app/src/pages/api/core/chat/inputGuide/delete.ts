import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

export type deleteInputGuideBody = { appId: string; dataIdList: string[] };

async function handler(req: ApiRequestProps<deleteInputGuideBody, ''>, res: ApiResponseType<any>) {
  const { appId, dataIdList } = req.body;
  await authApp({ req, appId, authToken: true, per: WritePermissionVal });

  await MongoChatInputGuide.deleteMany({
    _id: { $in: dataIdList },
    appId
  });

  return {};
}

export default NextAPI(handler);
