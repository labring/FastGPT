import path from 'node:path';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  DatasetSynonymMutationResponseSchema,
  UploadDatasetSynonymFileBodySchema,
  type DatasetSynonymMutationResponse
} from '@fastgpt/global/openapi/core/dataset/synonym/api';
import {
  DatasetSynonymMutationTypeEnum,
  DatasetSynonymLimits
} from '@fastgpt/global/core/dataset/synonym';
import { multer } from '@fastgpt/service/common/file/multer';
import { decodeMultipartFilename } from '@fastgpt/service/common/s3/filename';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseSynonymFile } from '@fastgpt/service/core/dataset/synonym/utils';
import { createDatasetSynonymMutation } from '@/service/core/dataset/synonym/mutation';

async function handler(req: ApiRequestProps): Promise<DatasetSynonymMutationResponse> {
  const filepaths: string[] = [];
  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: DatasetSynonymLimits.maxFileSize / 1024 / 1024,
      allowedExtensions: ['csv', 'xls', 'xlsx']
    });
    filepaths.push(result.fileMetadata.path);
    req.body = result.data;
    const { datasetId } = parseApiInput({
      req,
      bodySchema: UploadDatasetSynonymFileBodySchema
    }).body;
    const fileName = path.basename(decodeMultipartFilename(result.fileMetadata.originalname));
    const mappings = parseSynonymFile({
      buffer: result.getBuffer(),
      extension: path.extname(fileName)
    });
    return DatasetSynonymMutationResponseSchema.parse(
      await createDatasetSynonymMutation({
        req,
        datasetId,
        mappings,
        fileName,
        size: result.fileMetadata.size,
        type: DatasetSynonymMutationTypeEnum.upload
      })
    );
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);
