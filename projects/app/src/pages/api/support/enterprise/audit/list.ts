import { z } from 'zod';
import type { FilterQuery } from 'mongoose';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoEnterpriseAuditLog } from '@fastgpt/service/support/enterprise/audit/schema';
import { authEnterpriseRole } from '@fastgpt/service/support/enterprise/permission';
import type { EnterpriseAuditLogSchemaType } from '@fastgpt/global/support/enterprise/audit/type';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditActorTypeEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';

const AuditListQuerySchema = z.object({
  pageNum: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(20),
  action: z.nativeEnum(EnterpriseAuditActionEnum).optional(),
  result: z.nativeEnum(EnterpriseAuditResultEnum).optional(),
  actorType: z.nativeEnum(EnterpriseAuditActorTypeEnum).optional(),
  actorUserId: z.string().min(1).optional(),
  resourceType: z.nativeEnum(EnterpriseAuditResourceTypeEnum).optional(),
  resourceId: z.string().min(1).optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  searchKey: z.string().trim().max(200).optional()
});

export type AuditListResponse = {
  list: EnterpriseAuditLogSchemaType[];
  total: number;
  pageNum: number;
  pageSize: number;
};

async function handler(req: ApiRequestProps): Promise<AuditListResponse> {
  const { query } = parseApiInput({
    req,
    querySchema: AuditListQuerySchema
  });

  const { teamId } = await authEnterpriseRole({
    req,
    roles: [EnterpriseRoleEnum.AuditAdmin],
    allowTeamManageFallback: true
  });
  const where = buildAuditWhere({
    ...query,
    teamId
  });
  const skip = (query.pageNum - 1) * query.pageSize;

  const [list, total] = await Promise.all([
    MongoEnterpriseAuditLog.find(where)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(query.pageSize)
      .lean(),
    MongoEnterpriseAuditLog.countDocuments(where)
  ]);

  return {
    list: list.map((item) => ({
      ...item,
      _id: String(item._id)
    })) as EnterpriseAuditLogSchemaType[],
    total,
    pageNum: query.pageNum,
    pageSize: query.pageSize
  };
}

export default NextAPI(handler);

export const buildAuditWhere = ({
  teamId,
  action,
  result,
  actorType,
  actorUserId,
  resourceType,
  resourceId,
  startTime,
  endTime,
  searchKey
}: z.infer<typeof AuditListQuerySchema> & {
  teamId: string;
}): FilterQuery<EnterpriseAuditLogSchemaType> => {
  const where: FilterQuery<EnterpriseAuditLogSchemaType> = {
    'actor.teamId': teamId
  };

  if (action) where.action = action;
  if (result) where.result = result;
  if (actorType) where['actor.type'] = actorType;
  if (actorUserId) where['actor.userId'] = actorUserId;
  if (resourceType) where['resource.type'] = resourceType;
  if (resourceId) where['resource.id'] = resourceId;
  if (startTime || endTime) {
    where.timestamp = {
      ...(startTime ? { $gte: startTime } : {}),
      ...(endTime ? { $lte: endTime } : {})
    };
  }
  if (searchKey) {
    const searchRegex = new RegExp(replaceRegChars(searchKey), 'i');
    where.$or = [
      { action: searchRegex },
      { 'actor.name': searchRegex },
      { 'resource.name': searchRegex },
      { requestId: searchRegex },
      { clientIp: searchRegex }
    ];
  }

  return where;
};
