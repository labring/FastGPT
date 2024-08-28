import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';
export type OutLinkListQuery = {
  appId: string;
  type: string;
};
export type OutLinkListBody = {};
export type OutLinkListResponse = OutLinkSchema[];

async function handler(
  req: ApiRequestProps<OutLinkListBody, OutLinkListQuery>
): Promise<OutLinkListResponse> {
  const { appId, type } = req.query;
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

  return data;
}
export default NextAPI(handler);
