import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  OutLinkListQuerySchema,
  OutLinkListResponseSchema,
  type OutLinkListResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { normalizeShareOutLinkAllowAnonymous } from '@fastgpt/service/support/outLink/compatibility';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

// 查询应用的所有 OutLink
export async function handler(req: ApiRequestProps): Promise<OutLinkListResponseType> {
  const { appId, type } = parseApiInput({
    req,
    querySchema: OutLinkListQuerySchema
  }).query;
  await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  const data = await MongoOutLink.find({
    appId,
    type: type
  }).sort({
    _id: -1
  });

  const result = data.map((item) => item.toObject());
  return OutLinkListResponseSchema.parse(
    type === PublishChannelEnum.share
      ? result.map(normalizeShareOutLinkAllowAnonymous)
      : result.map(({ allowAnonymous: _allowAnonymous, ...item }) => item)
  );
}

export default NextAPI(handler);
