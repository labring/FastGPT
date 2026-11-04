import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import type { ApiKeyAuditParams } from '@fastgpt/global/support/openapi/schema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { ClientSession } from '../../common/mongo';
import { MongoApp } from '../../core/app/schema';
import { MongoTeamMember } from '../user/team/teamMemberSchema';
import { MongoOpenApi } from './schema';
import { getOpenApiTypeFilter } from './utils';
import { addAuditLog } from '../user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/**
 * 将指定成员的应用 Key 交给绑定应用的当前 owner，必须在应用交接之后、同一事务中调用。
 * 只更新 tmbId；条件写入防止覆盖其他交接。返回脱敏审计数据，由事务拥有者提交后记录。
 */
export const transferAppApiKeys = async ({
  teamId,
  fromTmbIds,
  appIds,
  session
}: {
  teamId: string;
  fromTmbIds: string[];
  appIds?: string[];
  session: ClientSession;
}): Promise<ApiKeyAuditParams[]> => {
  if (!fromTmbIds.length || appIds?.length === 0) return [];
  const keys = await MongoOpenApi.find(
    {
      teamId,
      ...getOpenApiTypeFilter(ApiKeyTypeEnum.app),
      tmbId: { $in: fromTmbIds },
      ...(appIds ? { appId: { $in: appIds } } : {})
    },
    '_id name appId tmbId',
    { session }
  ).lean();
  const apps = await MongoApp.find(
    { teamId, _id: { $in: keys.map((key) => key.appId) }, deleteTime: null },
    '_id tmbId',
    { session }
  ).lean();
  const appMap = new Map(apps.map((app) => [String(app._id), String(app.tmbId)]));
  const owners = await MongoTeamMember.find(
    { teamId, _id: { $in: [...appMap.values()] }, status: TeamMemberStatusEnum.active },
    '_id',
    { session }
  ).lean();
  const ownerIds = new Set(owners.map((owner) => String(owner._id)));
  const changes: ApiKeyAuditParams[] = [];
  for (const key of keys) {
    const nextOwner = appMap.get(key.appId!);
    if (!nextOwner || !ownerIds.has(nextOwner)) throw new Error('Application Key owner is invalid');
    if (nextOwner === String(key.tmbId)) continue;
    const result = await MongoOpenApi.updateOne(
      { _id: key._id, teamId, tmbId: key.tmbId, appId: key.appId },
      { $set: { tmbId: nextOwner } },
      { session }
    );
    if (result.matchedCount !== 1) throw new Error('Application Key ownership changed');
    changes.push({
      keyId: String(key._id),
      keyName: key.name,
      keyType: ApiKeyTypeEnum.app,
      appId: key.appId,
      fromTmbId: String(key.tmbId),
      toTmbId: nextOwner
    });
  }
  return changes;
};

/** 事务成功后记录归属变化；自动离职流程使用 system 作用域，不伪造离职者操作。 */
export const auditAppApiKeyTransfers = async ({
  teamId,
  changes,
  actorTmbId
}: {
  teamId: string;
  changes: ApiKeyAuditParams[];
  actorTmbId?: string;
}) => {
  for (const params of changes) {
    await addAuditLog({
      teamId,
      ...(actorTmbId ? { tmbId: actorTmbId } : { scope: 'system' as const }),
      event: AuditEventEnum.UPDATE_API_KEY,
      params
    });
  }
};
