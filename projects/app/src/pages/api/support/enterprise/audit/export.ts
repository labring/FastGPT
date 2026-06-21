import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { MongoEnterpriseAuditLog } from '@fastgpt/service/support/enterprise/audit/schema';
import { authEnterpriseRole } from '@fastgpt/service/support/enterprise/permission';
import {
  createUserAuditActor,
  getEnterpriseAuditRequestContext,
  writeEnterpriseAuditEvent
} from '@fastgpt/service/support/enterprise/audit/util';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditActorTypeEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';
import { buildAuditWhere } from './list';
import { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';

const AuditExportQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).optional().default(10000),
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

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { query } = parseApiInput({
    req,
    querySchema: AuditExportQuerySchema
  });

  const { userId, teamId, tmbId, isRoot } = await authEnterpriseRole({
    req,
    roles: [EnterpriseRoleEnum.AuditAdmin],
    allowTeamManageFallback: true
  });
  const where = buildAuditWhere({
    ...query,
    pageNum: 1,
    pageSize: query.limit,
    teamId
  });
  const list = await MongoEnterpriseAuditLog.find(where)
    .sort({ timestamp: -1 })
    .limit(query.limit)
    .lean();

  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.AuditExport,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({ userId, teamId, tmbId, isRoot }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.AuditLog,
      id: teamId
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      filters: query,
      exportCount: list.length
    }
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=enterprise-audit-${new Date().toISOString().slice(0, 10)}.csv;`
  );

  const csv = [
    '\uFEFFtimestamp,action,result,actorType,actorUserId,actorTeamId,actorTmbId,actorName,resourceType,resourceId,resourceName,requestId,clientIp,userAgent,metadata',
    ...list.map((item) =>
      [
        item.timestamp?.toISOString?.() ?? '',
        item.action,
        item.result,
        item.actor?.type,
        item.actor?.userId,
        item.actor?.teamId,
        item.actor?.tmbId,
        item.actor?.name,
        item.resource?.type,
        item.resource?.id,
        item.resource?.name,
        item.requestId,
        item.clientIp,
        item.userAgent,
        JSON.stringify(item.metadata ?? {})
      ]
        .map((value) => sanitizeCsvField(String(value ?? '')))
        .join(',')
    )
  ].join('\n');

  res.end(csv);
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: '20mb'
  }
};
