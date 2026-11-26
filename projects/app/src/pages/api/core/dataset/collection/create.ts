import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { NextAPI } from '@/service/middleware/entry';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { buildCollectionCreateAuditLog } from '@fastgpt/service/core/dataset/audit/collection';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  CreateCollectionBodySchema,
  CreateCollectionResponseSchema,
  type CreateCollectionResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

async function handler(req: ApiRequestProps): Promise<CreateCollectionResponseType> {
  const body = parseApiInput({ req, bodySchema: CreateCollectionBodySchema }).body;

  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    parentId: body.parentId
  });

  const { _id } = await createOneCollection({
    ...body,
    // inheritPermission（sangfor 专用）只对文件夹生效，非文件夹固定按继承态创建
    inheritPermission:
      body.type === DatasetCollectionTypeEnum.folder ? body.inheritPermission : true,
    teamId,
    tmbId
  });

  void addAuditLog(
    await buildCollectionCreateAuditLog({
      teamId,
      tmbId,
      dataset,
      collection: {
        _id,
        name: body.name,
        type: body.type,
        parentId: body.parentId
      }
    })
  );

  return CreateCollectionResponseSchema.parse(_id);
}

export default NextAPI(handler);
