import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  CreateCollectionBodySchema,
  CreateCollectionResponseSchema,
  type CreateCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

async function handler(req: ApiRequestProps): Promise<CreateCollectionResponseType> {
  const body = CreateCollectionBodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = await authDataset({
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

  return CreateCollectionResponseSchema.parse(_id);
}

export default NextAPI(handler);
