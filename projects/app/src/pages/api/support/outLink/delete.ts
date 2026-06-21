import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { stopWechatPolling } from '@fastgpt/service/support/outLink/wechat/mq';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  OutLinkDeleteQuerySchema,
  OutLinkDeleteResponseSchema,
  type OutLinkDeleteBodyType,
  type OutLinkDeleteQueryType,
  type OutLinkDeleteResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import {
  createUserAuditActor,
  getEnterpriseAuditRequestContext,
  writeEnterpriseAuditEvent
} from '@fastgpt/service/support/enterprise/audit/util';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';

/* delete a shareChat by shareChatId */
async function handler(
  req: ApiRequestProps<OutLinkDeleteBodyType, OutLinkDeleteQueryType>
): Promise<OutLinkDeleteResponseType> {
  const { id } = parseApiInput({
    req,
    querySchema: OutLinkDeleteQuerySchema
  }).query;
  const { tmbId, teamId, userId, outLink, app } = await authOutLinkCrud({
    req,
    outLinkId: id,
    authToken: true,
    per: OwnerPermissionVal
  });

  const outlink = await MongoOutLink.findById(id);

  if (outlink && outlink.type === 'wechat') {
    await stopWechatPolling(outlink.shareId).catch((error) => {
      console.warn('Stop wechat polling failed', error);
    });
  }

  await outlink?.deleteOne();

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL,
      params: {
        appName: app.name,
        channelName: outLink.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();
  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.ShareLinkDelete,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({ userId, teamId, tmbId }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.ShareLink,
      id,
      name: outLink.name
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      appId: String(app._id),
      appName: app.name,
      appType: app.type,
      linkType: outlink?.type
    }
  });

  return OutLinkDeleteResponseSchema.parse(undefined);
}

export default NextAPI(handler);
