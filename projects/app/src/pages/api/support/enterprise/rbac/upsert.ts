import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authEnterpriseAdmin } from '@fastgpt/service/support/enterprise/permission';
import { MongoEnterpriseRoleBinding } from '@fastgpt/service/support/enterprise/rbac/schema';
import { normalizeEnterpriseRoles } from '@fastgpt/service/support/enterprise/rbac/controller';
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

const UpsertEnterpriseRoleBodySchema = z.object({
  userId: z.string().min(1),
  tmbId: z.string().min(1).optional(),
  roles: z.array(z.string()).default([])
});

async function handler(req: ApiRequestProps) {
  const {
    body: { userId: targetUserId, tmbId, roles: rawRoles }
  } = parseApiInput({
    req,
    bodySchema: UpsertEnterpriseRoleBodySchema
  });
  const { userId, teamId, tmbId: actorTmbId, isRoot } = await authEnterpriseAdmin({ req });
  const roles = normalizeEnterpriseRoles(rawRoles);

  const binding = await MongoEnterpriseRoleBinding.findOneAndUpdate(
    {
      teamId,
      userId: targetUserId
    },
    {
      teamId,
      userId: targetUserId,
      tmbId,
      roles,
      createdBy: userId,
      updateTime: new Date()
    },
    {
      upsert: true,
      new: true
    }
  ).lean();

  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.IdentityConfigUpdate,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({ userId, teamId, tmbId: actorTmbId, isRoot }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.User,
      id: targetUserId
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      operation: 'enterprise_role_upsert',
      roles
    }
  });

  return {
    ...binding,
    _id: String(binding?._id)
  };
}

export default NextAPI(handler);
