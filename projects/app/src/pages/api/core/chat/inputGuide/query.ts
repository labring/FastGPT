import type { NextApiResponse } from 'next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  QueryChatInputGuideBodySchema,
  QueryChatInputGuideResponseSchema,
  type QueryChatInputGuideResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<QueryChatInputGuideResponseType> {
  const { appId, searchKey, ...authProps } = QueryChatInputGuideBodySchema.parse(req.body);

  // tmp auth
  const { teamId } = await authChatCrud({ req, authToken: true, appId, ...authProps });
  const app = await MongoApp.findOne({ _id: appId, teamId });
  if (!app) {
    return Promise.reject(AppErrEnum.unAuthApp);
  }

  const params = {
    appId,
    ...(searchKey && { text: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } })
  };

  const result = await MongoChatInputGuide.find(params).sort({ _id: -1 }).limit(6);

  return QueryChatInputGuideResponseSchema.parse(
    result
      .map((item) => item.text)
      .filter(Boolean)
      .filter((item) => item !== searchKey)
  );
}

export default NextAPI(handler);
