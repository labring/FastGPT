import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nAppType } from '@fastgpt/service/support/operationLog/util';
export type OutLinkUpdateQuery = {};

// {
// _id?: string; // Outlink 的 ID
// name: string; // Outlink 的名称
// responseDetail?: boolean; // 是否开启详细回复
// immediateResponse?: string; // 立即回复的内容
// defaultResponse?: string; // 默认回复的内容
// limit?: OutLinkSchema<T>['limit']; // 限制
// app?: T; // 平台的配置
// }
export type OutLinkUpdateBody = OutLinkEditType;

export type OutLinkUpdateResponse = {};

async function handler(
  req: ApiRequestProps<OutLinkUpdateBody, OutLinkUpdateQuery>
): Promise<OutLinkUpdateResponse> {
  const { _id, name, responseDetail, limit, app, showRawSource, showNodeStatus } = req.body;

  if (!_id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const {
    tmbId,
    teamId,
    outLink,
    app: logApp
  } = await authOutLinkCrud({
    req,
    outLinkId: _id,
    authToken: true,
    per: ManagePermissionVal
  });

  await MongoOutLink.findByIdAndUpdate(_id, {
    name,
    responseDetail,
    showRawSource,
    showNodeStatus,
    // showFullText,
    limit,
    app
  });

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.UPDATE_APP_PUBLISH_CHANNEL,
      params: {
        appName: logApp.name,
        channelName: outLink.name,
        appType: getI18nAppType(logApp.type)
      }
    });
  })();
  return {};
}
export default NextAPI(handler);
