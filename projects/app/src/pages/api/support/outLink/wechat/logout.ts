import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { logoutWechatChannel } from '@fastgpt/service/support/outLink/wechat/service';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WechatLogoutBodySchema,
  type WechatLogoutBodyType
} from '@fastgpt/global/openapi/support/outLink/provider/wechat';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { assertWechatOutLink } from '@fastgpt/service/support/outLink/wechat/utils';

async function handler(req: ApiRequestProps<WechatLogoutBodyType>): Promise<void> {
  const { outLinkId } = parseApiInput({
    req,
    bodySchema: WechatLogoutBodySchema
  }).body;

  const { outLink } = await authOutLinkCrud({
    req,
    authToken: true,
    outLinkId,
    per: ManagePermissionVal
  });
  await assertWechatOutLink(outLink);

  await logoutWechatChannel(outLinkId);
}

export default NextAPI(handler);
