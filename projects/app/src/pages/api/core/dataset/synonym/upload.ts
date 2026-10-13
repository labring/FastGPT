import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DatasetSynonymMutationResponseSchema,
  UploadDatasetSynonymBodySchema,
  type DatasetSynonymMutationResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { DatasetSynonymMutationTypeEnum } from '@fastgpt/global/core/dataset/synonym';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  normalizeSynonymInputMappings,
  serializeSynonymMappingsToCsv
} from '@fastgpt/service/core/dataset/synonym/utils';
import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';
import { assertDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

async function handler(req: ApiRequestProps): Promise<DatasetSynonymMutationResponse> {
  assertDatasetSynonymEnabled();

  const {
    datasetId,
    mappings: inputMappings,
    fileName = 'synonyms.csv'
  } = parseApiInput({
    req,
    bodySchema: UploadDatasetSynonymBodySchema
  }).body;
  const mappings = normalizeSynonymInputMappings(inputMappings);
  const csv = serializeSynonymMappingsToCsv(mappings);
  const result = await createDatasetSynonymMutation({
    req,
    datasetId,
    mappings,
    fileName,
    size: Buffer.byteLength(csv),
    type: DatasetSynonymMutationTypeEnum.upload
  });
  return DatasetSynonymMutationResponseSchema.parse(result);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);
