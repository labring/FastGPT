import type { NextApiResponse } from 'next';
import { MongoChatInputGuide } from '@fastgpt/service/core/chat/inputGuide/schema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/types';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  QueryChatInputGuideBodySchema,
  QueryChatInputGuideResponseSchema,
  type QueryChatInputGuideResponseType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<QueryChatInputGuideResponseType> {
  const { sourceType, sourceId, outLinkAuthData, searchKey } = parseApiInput({
    req,
    bodySchema: QueryChatInputGuideBodySchema
  }).body;

  if (sourceType !== ChatSourceTypeEnum.app) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const { teamId, sourceId: resolvedSourceId } = await authChatTargetCrud({
    req,
    authToken: true,
    sourceType,
    sourceId,
    outLinkAuthData
  });
  const app = await MongoApp.findOne({ _id: resolvedSourceId, teamId });
  if (!app) {
    return Promise.reject(AppErrEnum.unAuthApp);
  }

  const params = {
    appId: resolvedSourceId,
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
