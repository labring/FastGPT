import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  SearchDatasetSynonymMappingsBodySchema,
  SearchDatasetSynonymMappingsResponseSchema,
  type SearchDatasetSynonymMappingsResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { searchDatasetSynonymMappings } from '@fastgpt/service/core/dataset/synonym/controller';
import { assertDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

async function handler(req: ApiRequestProps): Promise<SearchDatasetSynonymMappingsResponse> {
  assertDatasetSynonymEnabled();

  const body = parseApiInput({
    req,
    bodySchema: SearchDatasetSynonymMappingsBodySchema
  }).body;
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: body.datasetId,
    per: ReadPermissionVal
  });
  return SearchDatasetSynonymMappingsResponseSchema.parse(
    await searchDatasetSynonymMappings({ teamId, ...body })
  );
}

export default NextAPI(handler);
