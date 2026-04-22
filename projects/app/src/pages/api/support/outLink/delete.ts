import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { stopWechatPolling } from '@fastgpt/service/support/outLink/wechat/mq';

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
  const { tmbId, teamId, outLink, app } = await authOutLinkCrud({
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

  return {};
}

export default NextAPI(handler);
