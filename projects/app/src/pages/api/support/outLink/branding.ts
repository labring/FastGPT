import type { ApiRequestProps } from '@fastgpt/next/type';
import {
  GetOutLinkBrandQuerySchema,
  GetOutLinkBrandResponseSchema,
  type GetOutLinkBrandResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { getTeamCanHideShareBrand } from '@fastgpt/service/support/wallet/sub/service';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { NextAPI } from '@/service/middleware/entry';

/** 只读取所属团队的品牌权益；查询失败由统一中间件返回错误，不能当成没有权益。 */
export async function handler(req: ApiRequestProps): Promise<GetOutLinkBrandResponseType> {
  const { id } = parseApiInput({ req, querySchema: GetOutLinkBrandQuerySchema }).query;
  const { outLink } = await authOutLinkCrud({
    req,
    outLinkId: id,
    authToken: true,
    per: ManagePermissionVal
  });
  if (outLink.type !== PublishChannelEnum.share) throw OutLinkErrEnum.linkUnInvalid;

  return GetOutLinkBrandResponseSchema.parse({
    isShowBrand: outLink.isShowBrand,
    canHideShareBrand: await getTeamCanHideShareBrand(String(outLink.teamId))
  });
}

export default NextAPI(handler);
