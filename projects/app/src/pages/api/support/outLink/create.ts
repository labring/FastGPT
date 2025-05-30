import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { customAlphabet } from 'nanoid';
import type { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nAppType } from '@fastgpt/service/support/operationLog/util';
/* create a shareChat */
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

export type OutLinkCreateQuery = {};
export type OutLinkCreateBody = OutLinkEditType &
  OutLinkEditType & {
    appId: string;
    type: PublishChannelEnum;
  };
export type OutLinkCreateResponse = string;

async function handler(
  req: ApiRequestProps<OutLinkCreateBody, OutLinkCreateQuery>
): Promise<OutLinkCreateResponse> {
  const { appId, ...props } = req.body;

  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  const shareId = nanoid();
  await MongoOutLink.create({
    shareId,
    teamId,
    tmbId,
    appId,
    ...props
  });

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.CREATE_APP_PUBLISH_CHANNEL,
      params: {
        appName: app.name,
        channelName: props.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return shareId;
}

export default NextAPI(handler);
