import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WechatLogoutBodySchema,
  WechatLogoutResponseSchema,
  type WechatLogoutBodyType,
  type WechatLogoutResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { assertWechatOutLink } from '@fastgpt/service/support/outLink/wechat/utils';

async function handler(
  req: ApiRequestProps<WechatLogoutBodyType>
): Promise<WechatLogoutResponseType> {
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

  await MongoOutLink.updateOne(
    { _id: outLink._id },
    {
      $set: {
        'app.status': 'offline',
        'app.token': '',
        'app.lastError': ''
      }
    }
  );

  return WechatLogoutResponseSchema.parse(undefined);
}

export default NextAPI(handler);
