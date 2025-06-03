import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nAppType } from '@fastgpt/service/support/operationLog/util';

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

  await MongoOutLink.findByIdAndDelete(id);

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.DELETE_APP_PUBLISH_CHANNEL,
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
