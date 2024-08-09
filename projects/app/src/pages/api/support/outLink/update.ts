import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

export type OutLinkUpdateQuery = {};
export type OutLinkUpdateBody = OutLinkEditType & {};
export type OutLinkUpdateResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkUpdateBody, OutLinkUpdateQuery>
): Promise<OutLinkUpdateResponse> {
  const { _id, name, responseDetail, limit, app } = req.body;

  if (!_id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  await authOutLinkCrud({ req, outLinkId: _id, authToken: true, per: OwnerPermissionVal });

  await MongoOutLink.findByIdAndUpdate(_id, {
    name,
    responseDetail,
    limit,
    app
  });
  return {};
}
export default NextAPI(handler);
