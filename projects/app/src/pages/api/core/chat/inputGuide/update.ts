import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';

export type updateChatInputGuideQuery = {};

export type updateInputGuideBody = {
  appId: string;
  dataId: string;
  text: string;
};

export type updateInputGuideResponse = {};

async function handler(
  req: ApiRequestProps<updateInputGuideBody, updateChatInputGuideQuery>,
  res: ApiResponseType<any>
): Promise<updateInputGuideResponse> {
  const { appId, dataId, text } = req.body;
  await authApp({ req, appId, authToken: true, per: 'r' });

  await MongoChatInputGuide.findOneAndUpdate(
    {
      _id: dataId,
      appId
    },
    {
      text
    }
  );

  return {};
}

export default NextAPI(handler);
