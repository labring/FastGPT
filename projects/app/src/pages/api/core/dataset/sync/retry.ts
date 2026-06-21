import { z } from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addDatasetSyncJob } from '@fastgpt/service/core/dataset/datasetSync';
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

const DatasetSyncRetryBodySchema = z.object({
  datasetId: z.string().min(1)
});

async function handler(req: ApiRequestProps) {
  const { datasetId } = parseApiInput({
    req,
    bodySchema: DatasetSyncRetryBodySchema
  }).body;

  const { dataset, userId, teamId, tmbId, isRoot } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: ManagePermissionVal
  });

  try {
    const job = await addDatasetSyncJob({ datasetId });
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.KnowledgeSyncRun,
      result: EnterpriseAuditResultEnum.Success,
      actor: createUserAuditActor({ userId, teamId, tmbId, isRoot }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.Dataset,
        id: datasetId,
        name: dataset.name
      },
      ...getEnterpriseAuditRequestContext(req),
      metadata: {
        trigger: 'manual_retry',
        jobId: job.id
      }
    });

    return {
      datasetId,
      jobId: job.id
    };
  } catch (error) {
    writeEnterpriseAuditEvent({
      action: EnterpriseAuditActionEnum.KnowledgeSyncRun,
      result: EnterpriseAuditResultEnum.Failure,
      actor: createUserAuditActor({ userId, teamId, tmbId, isRoot }),
      resource: {
        type: EnterpriseAuditResourceTypeEnum.Dataset,
        id: datasetId,
        name: dataset.name
      },
      ...getEnterpriseAuditRequestContext(req),
      metadata: {
        trigger: 'manual_retry',
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

export default NextAPI(handler);
