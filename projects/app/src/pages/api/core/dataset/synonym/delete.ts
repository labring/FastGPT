import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteDatasetSynonymQuerySchema,
  DeleteDatasetSynonymResponseSchema,
  type DeleteDatasetSynonymResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { DatasetSynonymMutationTypeEnum } from '@fastgpt/global/core/dataset/synonym';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';

async function handler(req: ApiRequestProps): Promise<DeleteDatasetSynonymResponse> {
  const { id, oldFileVersion } = parseApiInput({
    req,
    querySchema: DeleteDatasetSynonymQuerySchema
  }).query;
  const config = await MongoDatasetSynonym.findById(id).lean();
  if (!config) throw new Error('同义词配置不存在');
  const datasetId = String(config.datasetId);
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });
  if (String(config.teamId) !== teamId) throw new Error('无权删除该同义词配置');
  const result = await createDatasetSynonymMutation({
    req,
    datasetId,
    mappings: [],
    fileName: '',
    size: 0,
    expectedSynonymId: id,
    expectedFileVersion: oldFileVersion,
    type: DatasetSynonymMutationTypeEnum.delete
  });
  return DeleteDatasetSynonymResponseSchema.parse(result);
}

export default NextAPI(handler);
