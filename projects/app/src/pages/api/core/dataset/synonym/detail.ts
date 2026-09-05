import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetDatasetSynonymDetailQuerySchema,
  GetDatasetSynonymDetailResponseSchema,
  type GetDatasetSynonymDetailResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getDatasetSynonymDetail } from '@fastgpt/service/core/dataset/synonym/controller';
import { assertDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

async function handler(req: ApiRequestProps): Promise<GetDatasetSynonymDetailResponse> {
  assertDatasetSynonymEnabled();

  const { datasetId } = parseApiInput({
    req,
    querySchema: GetDatasetSynonymDetailQuerySchema
  }).query;
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  return GetDatasetSynonymDetailResponseSchema.parse(
    await getDatasetSynonymDetail({ teamId, datasetId })
  );
}

export default NextAPI(handler);
