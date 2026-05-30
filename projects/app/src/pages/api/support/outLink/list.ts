import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import {
  OutLinkListQuerySchema,
  OutLinkListResponseSchema
} from '@fastgpt/global/openapi/support/outLink/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type OutLinkListBody = Record<string, never>;

// 应用内全部 Outlink 列表
export type OutLinkListResponse = OutLinkSchemaType[];

// 查询应用的所有 OutLink
export async function handler(req: ApiRequestProps): Promise<OutLinkListResponse> {
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

  return OutLinkListResponseSchema.parse(data) as OutLinkListResponse;
}

export default NextAPI(handler);
