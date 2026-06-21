import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  OutLinkUpdateBodySchema,
  OutLinkUpdateResponseSchema,
  type OutLinkUpdateBodyType,
  type OutLinkUpdateResponseType
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

// {
// _id?: string; // Outlink 的 ID
// name: string; // Outlink 的名称
// responseDetail?: boolean; // 是否开启详细回复
// immediateResponse?: string; // 立即回复的内容
// defaultResponse?: string; // 默认回复的内容
// limit?: OutLinkSchemaType<T>['limit']; // 限制
// app?: T; // 平台的配置
// }

async function handler(
  req: ApiRequestProps<OutLinkUpdateBodyType>
): Promise<OutLinkUpdateResponseType> {
  const {
    _id,
    name,
    showCite,
    limit,
    app,
    canDownloadSource,
    showRunningStatus,
    showSkillReferences,
    showFullText
  } = parseApiInput({
    req,
    bodySchema: OutLinkUpdateBodySchema
  }).body;

  if (!_id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const {
    tmbId,
    teamId,
    userId,
    outLink,
    app: logApp
  } = await authOutLinkCrud({
    req,
    outLinkId: _id,
    authToken: true,
    per: ManagePermissionVal
  });

  const doc = await MongoOutLink.findByIdAndUpdate(_id, {
    name,
    showCite,
    canDownloadSource,
    showRunningStatus,
    showSkillReferences,
    showFullText,
    limit,
    app
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_APP_PUBLISH_CHANNEL,
      params: {
        appName: logApp.name,
        channelName: outLink.name,
        appType: getI18nAppType(logApp.type)
      }
    });
  })();
  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.ShareLinkUpdate,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({ userId, teamId, tmbId }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.ShareLink,
      id: _id,
      name: outLink.name
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      appId: String(logApp._id),
      appName: logApp.name,
      appType: logApp.type,
      updatedFields: Object.entries({
        name,
        showCite,
        canDownloadSource,
        showRunningStatus,
        showSkillReferences,
        showFullText,
        limit,
        app
      })
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key)
    }
  });
  return OutLinkUpdateResponseSchema.parse(doc?.shareId!);
}
export default NextAPI(handler);
