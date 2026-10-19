import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionTypeMap
} from '@fastgpt/global/core/dataset/constants';
import {
  CreateCollectionBodySchema,
  CreateCollectionResponseSchema,
  type CreateCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { getDatasetCollectionPaths } from './paths';

async function handler(req: ApiRequestProps): Promise<CreateCollectionResponseType> {
  const body = parseApiInput({ req, bodySchema: CreateCollectionBodySchema }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
  });
  const parentPaths = await getDatasetCollectionPaths({
    parentId: body.parentId ?? undefined
  }).catch(() => []);
  const location = [dataset.name, ...parentPaths.map((path) => path.parentName)].join('/');
  const objectType = DatasetCollectionTypeMap[body.type]?.name ?? body.type;

  const { _id } = await createOneCollection({
    ...body,
    // inheritPermission（sangfor 专用）只对文件夹生效，非文件夹固定按继承态创建
    inheritPermission:
      body.type === DatasetCollectionTypeEnum.folder ? body.inheritPermission : true,
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
        datasetType: getI18nDatasetType(dataset.type),
        objectType,
        location
      }
    });
  })();

  return CreateCollectionResponseSchema.parse(_id);
}

export default NextAPI(handler);
