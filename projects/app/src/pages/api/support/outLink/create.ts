import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  OutLinkCreateBodySchema,
  OutLinkCreateResponseSchema,
  type OutLinkCreateBodyType,
  type OutLinkCreateResponseType
} from '@fastgpt/global/openapi/support/outLink/api';

async function handler(
  req: ApiRequestProps<OutLinkCreateBodyType>
): Promise<OutLinkCreateResponseType> {
  const { appId, ...props } = parseApiInput({
    req,
    bodySchema: OutLinkCreateBodySchema
  }).body;

  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  const shareId = getNanoid(24);
  await MongoOutLink.create({
    shareId,
    teamId,
    tmbId,
    appId,
    ...props
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_APP_PUBLISH_CHANNEL,
      params: {
        appName: app.name,
        channelName: props.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return OutLinkCreateResponseSchema.parse(shareId);
}

export default NextAPI(handler);
