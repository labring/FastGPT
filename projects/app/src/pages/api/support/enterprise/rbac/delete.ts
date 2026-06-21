import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authEnterpriseAdmin } from '@fastgpt/service/support/enterprise/permission';
import { MongoEnterpriseRoleBinding } from '@fastgpt/service/support/enterprise/rbac/schema';
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

const DeleteEnterpriseRoleQuerySchema = z.object({
  userId: z.string().min(1)
});

async function handler(req: ApiRequestProps) {
  const { userId: targetUserId } = parseApiInput({
    req,
    querySchema: DeleteEnterpriseRoleQuerySchema
  }).query;
  const { userId, teamId, tmbId, isRoot } = await authEnterpriseAdmin({ req });

  await MongoEnterpriseRoleBinding.deleteOne({
    teamId,
    userId: targetUserId
  });

  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.IdentityConfigUpdate,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({ userId, teamId, tmbId, isRoot }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.User,
      id: targetUserId
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      operation: 'enterprise_role_delete'
    }
  });
}

export default NextAPI(handler);
