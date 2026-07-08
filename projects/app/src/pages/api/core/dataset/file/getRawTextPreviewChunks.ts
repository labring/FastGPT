import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { rawText2Chunks } from '@fastgpt/service/core/dataset/read';
import {
  computedCollectionChunkSettings,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { getEmbeddingModel, getLLMModel } from '@fastgpt/service/core/ai/model';
import { replaceS3KeyToPreviewUrl } from '@fastgpt/service/core/dataset/utils';
import { addDays } from 'date-fns';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetRawTextPreviewChunksBodySchema,
  GetRawTextPreviewChunksResponseSchema,
  type GetRawTextPreviewChunksBody,
  type GetRawTextPreviewChunksResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

async function handler(
  req: ApiRequestProps<GetRawTextPreviewChunksBody>
): Promise<GetRawTextPreviewChunksResponse> {
  const { datasetId, rawText, overlapRatio, ...chunkSettings } = parseApiInput({
    req,
    bodySchema: GetRawTextPreviewChunksBodySchema
  }).body;

  const { dataset } = await authDataset({
    req,
    authApiKey: true,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  const formatChunkSettings = computedCollectionChunkSettings({
    ...chunkSettings,
    llmModel: getLLMModel(dataset.agentModel),
    vectorModel: getEmbeddingModel(dataset.vectorModel)
  });

  const chunks = await rawText2Chunks({
    rawText,
    chunkTriggerType: formatChunkSettings.chunkTriggerType,
    chunkTriggerMinSize: formatChunkSettings.chunkTriggerMinSize,
    chunkSize: formatChunkSettings.chunkSize,
    paragraphChunkDeep: formatChunkSettings.paragraphChunkDeep,
    paragraphChunkMinSize: formatChunkSettings.paragraphChunkMinSize,
    maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
    overlapRatio,
    customReg: formatChunkSettings.chunkSplitter ? [formatChunkSettings.chunkSplitter] : []
  });

  const chunksWithJWT = chunks.slice(0, 10).map((chunk) => ({
    q: replaceS3KeyToPreviewUrl(chunk.q, addDays(new Date(), 1)),
    a: replaceS3KeyToPreviewUrl(chunk.a, addDays(new Date(), 1))
  }));

  return GetRawTextPreviewChunksResponseSchema.parse({
    chunks: chunksWithJWT,
    total: chunks.length
  });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);
