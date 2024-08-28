import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

export type OutLinkDeleteQuery = {
  id: string;
};
export type OutLinkDeleteBody = {};
export type OutLinkDeleteResponse = {};

/* delete a shareChat by shareChatId */
async function handler(
  req: ApiRequestProps<OutLinkDeleteBody, OutLinkDeleteQuery>
): Promise<OutLinkDeleteResponse> {
  const { id } = req.query;
  await authOutLinkCrud({ req, outLinkId: id, authToken: true, per: OwnerPermissionVal });
  await MongoOutLink.findByIdAndRemove(id);
  return {};
}

export default NextAPI(handler);
