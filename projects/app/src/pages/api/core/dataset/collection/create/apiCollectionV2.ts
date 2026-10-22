import {
  CreateApiCollectionV2BodySchema,
  CreateApiCollectionV2ResponseSchema,
  type CreateApiCollectionV2ResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import { createApiDatasetCollection } from '@fastgpt/service/core/dataset/apiDataset/service';
import { authApiFileImportChanges } from '@fastgpt/service/core/dataset/apiDataset/auth';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';

/** V2 入口先校验知识库，再由远端树生成实际创建/移动计划逐项鉴权。 */
async function handler(req: ApiRequestProps): Promise<CreateApiCollectionV2ResponseType> {
  const body = parseApiInput({ req, bodySchema: CreateApiCollectionV2BodySchema }).body;
  const { teamId, tmbId, dataset } = await authDatasetCollectionCreate({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId
  });
  await checkDatasetIndexLimit({ teamId, insertLen: 1 });
  return CreateApiCollectionV2ResponseSchema.parse(
    await createApiDatasetCollection({
      ...body,
      parentId: undefined,
      teamId,
      tmbId,
      dataset,
      authorizeChanges: (changes) =>
        authApiFileImportChanges({
          req,
          authToken: true,
          authApiKey: true,
          datasetId: body.datasetId,
          ...changes
        })
    })
  );
}

export default NextAPI(handler);
