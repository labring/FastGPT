import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { reconcileDatasetSyncSchedulers } from '@fastgpt/service/core/dataset/datasetSync';
import { authEnterpriseRole } from '@fastgpt/service/support/enterprise/permission';
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
import { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';

async function handler(req: ApiRequestProps) {
  const { userId, teamId, tmbId, isRoot } = await authEnterpriseRole({
    req,
    roles: [EnterpriseRoleEnum.KnowledgeAdmin],
    allowTeamManageFallback: true
  });

  try {
    const result = await reconcileDatasetSyncSchedulers();
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.KnowledgeSyncRun,
      result: EnterpriseAuditResultEnum.Success,
      actor: createUserAuditActor({ userId, teamId, tmbId, isRoot }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.Team,
        id: teamId
      },
      ...getEnterpriseAuditRequestContext(req),
      metadata: {
        trigger: 'scheduler_reconcile',
        ...result
      }
    });

    return result;
  } catch (error) {
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.KnowledgeSyncRun,
      result: EnterpriseAuditResultEnum.Failure,
      actor: createUserAuditActor({ userId, teamId, tmbId, isRoot }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.Team,
        id: teamId
      },
      ...getEnterpriseAuditRequestContext(req),
      metadata: {
        trigger: 'scheduler_reconcile',
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

export default NextAPI(handler);
