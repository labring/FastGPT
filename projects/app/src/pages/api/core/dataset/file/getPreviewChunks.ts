import {
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetSourceReadTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  OwnerPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authCollectionFile } from '@fastgpt/service/support/permission/auth/file';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  computeChunkSize,
  computeChunkSplitter,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getLLMModel } from '@fastgpt/service/core/ai/model';

export type PostPreviewFilesChunksProps = {
  datasetId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;

  customPdfParse?: boolean;

  trainingType: DatasetCollectionDataProcessModeEnum;

  // Chunk settings
  chunkSettingMode: ChunkSettingModeEnum;
  chunkSplitMode: DataChunkSplitModeEnum;
  chunkSize: number;
  chunkSplitter?: string;
  overlapRatio: number;

  // Read params
  selector?: string;
  isQAImport?: boolean;
  externalFileId?: string;
};
export type PreviewChunksResponse = {
  chunks: {
    q: string;
    a: string;
  }[];
  total: number;
};

async function handler(
  req: ApiRequestProps<PostPreviewFilesChunksProps>
): Promise<PreviewChunksResponse> {
  let {
    type,
    sourceId,
    customPdfParse = false,

    trainingType,
    chunkSettingMode,
    chunkSplitMode,
    chunkSize,
    chunkSplitter,

    overlapRatio,
    selector,
    isQAImport,
    datasetId,
    externalFileId
  } = req.body;

  if (!sourceId) {
    throw new Error('sourceId is empty');
  }

  const fileAuthRes =
    type === DatasetSourceReadTypeEnum.fileLocal
      ? await authCollectionFile({
          req,
          authToken: true,
          authApiKey: true,
          fileId: sourceId,
          per: OwnerPermissionVal
        })
      : undefined;

  const { dataset, teamId, tmbId } = await authDataset({
    req,
    authApiKey: true,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  if (fileAuthRes && String(fileAuthRes.tmbId) !== String(tmbId) && !fileAuthRes.isRoot) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  chunkSize = computeChunkSize({
    trainingType,
    chunkSettingMode,
    chunkSplitMode,
    chunkSize,
    llmModel: getLLMModel(dataset.agentModel)
  });

  chunkSplitter = computeChunkSplitter({
    chunkSettingMode,
    chunkSplitMode,
    chunkSplitter
  });

  const { rawText } = await readDatasetSourceRawText({
    teamId,
    tmbId,
    type,
    sourceId,
    selector,
    isQAImport,
    apiServer: dataset.apiServer,
    feishuServer: dataset.feishuServer,
    yuqueServer: dataset.yuqueServer,
    externalFileId,
    customPdfParse
  });

  const chunks = rawText2Chunks({
    rawText,
    chunkSize,
    maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
    overlapRatio,
    customReg: chunkSplitter ? [chunkSplitter] : [],
    isQAImport: isQAImport
  });
  return {
    chunks: chunks.slice(0, 10),
    total: chunks.length
  };
}
export default NextAPI(handler);
