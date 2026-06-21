import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateCollectionBodySchema,
  CreateCollectionResponseSchema,
  type CreateCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
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

async function handler(req: ApiRequestProps): Promise<CreateCollectionResponseType> {
  const body = parseApiInput({ req, bodySchema: CreateCollectionBodySchema }).body;

  const { teamId, tmbId, dataset, userId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: WritePermissionVal
  });

  const { _id } = await createOneCollection({
    ...body,
    teamId,
    tmbId
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_COLLECTION,
      params: {
        collectionName: body.name,
        datasetName: dataset.name,
        datasetType: getI18nDatasetType(dataset.type)
      }
    });
  })();
  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.DatasetCollectionImport,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({ userId, teamId, tmbId }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.Collection,
      id: String(_id),
      name: body.name
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      datasetId: body.datasetId,
      datasetName: dataset.name,
      datasetType: dataset.type
    }
  });

  return CreateCollectionResponseSchema.parse(_id);
}

export default NextAPI(handler);
