import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildAppAuditResource } from '@fastgpt/global/support/user/audit/type';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { removeWechatPollJob } from '@fastgpt/service/support/outLink/wechat/mq';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  OutLinkDeleteQuerySchema,
  OutLinkDeleteResponseSchema,
  type OutLinkDeleteBodyType,
  type OutLinkDeleteQueryType,
  type OutLinkDeleteResponseType
} from '@fastgpt/global/openapi/support/outLink/api';

/* delete a shareChat by shareChatId */
async function handler(
  req: ApiRequestProps<OutLinkDeleteBodyType, OutLinkDeleteQueryType>
): Promise<OutLinkDeleteResponseType> {
  const { id } = parseApiInput({
    req,
    querySchema: OutLinkDeleteQuerySchema
  }).query;
  const { tmbId, teamId, outLink, app } = await authOutLinkCrud({
    req,
    outLinkId: id,
    authToken: true,
    per: ManagePermissionVal
  });

  await MongoOutLink.deleteOne({ _id: id, teamId });
  if (outLink.type === 'wechat') await removeWechatPollJob(outLink.shareId);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_APP_PUBLISH_CHANNEL,
      resources: [buildAppAuditResource(app)],
      params: {
        appName: app.name,
        channelName: outLink.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return OutLinkDeleteResponseSchema.parse(undefined);
}

export default NextAPI(handler);
