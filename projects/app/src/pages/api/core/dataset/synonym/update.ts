import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DatasetSynonymMutationResponseSchema,
  UpdateDatasetSynonymBodySchema,
  type DatasetSynonymMutationResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { DatasetSynonymMutationTypeEnum } from '@fastgpt/global/core/dataset/synonym';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  normalizeSynonymInputMappings,
  serializeSynonymMappingsToCsv
} from '@fastgpt/service/core/dataset/synonym/utils';
import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';

async function handler(req: ApiRequestProps): Promise<DatasetSynonymMutationResponse> {
  const {
    datasetId,
    mappings: inputMappings,
    fileName = 'synonyms.csv',
    oldSynonymId,
    oldFileVersion
  } = parseApiInput({
    req,
    bodySchema: UpdateDatasetSynonymBodySchema
  }).body;
  const mappings = normalizeSynonymInputMappings(inputMappings);
  const csv = serializeSynonymMappingsToCsv(mappings);
  const result = await createDatasetSynonymMutation({
    req,
    datasetId,
    mappings,
    fileName,
    size: Buffer.byteLength(csv),
    expectedSynonymId: oldSynonymId,
    expectedFileVersion: oldFileVersion,
    type: DatasetSynonymMutationTypeEnum.update
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
