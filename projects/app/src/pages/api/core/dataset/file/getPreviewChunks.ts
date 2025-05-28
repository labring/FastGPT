import {
  ChunkSettingModeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  OwnerPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authCollectionFile } from '@fastgpt/service/support/permission/auth/file';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  computeChunkSize,
  computeChunkSplitter,
  computeParagraphChunkDeep,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import type { ChunkSettingsType } from '@fastgpt/global/core/dataset/type';

export type PostPreviewFilesChunksProps = ChunkSettingsType & {
  datasetId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;

  customPdfParse?: boolean;

  // Chunk settings
  overlapRatio: number;

  // Read params
  selector?: string;
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

    trainingType = DatasetCollectionDataProcessModeEnum.chunk,

    chunkTriggerType,
    chunkTriggerMinSize,

    chunkSettingMode = ChunkSettingModeEnum.auto,
    chunkSplitMode,
    paragraphChunkDeep,
    paragraphChunkMinSize,
    chunkSize,
    chunkSplitter,

    overlapRatio,
    selector,
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
  paragraphChunkDeep = computeParagraphChunkDeep({
    chunkSettingMode,
    chunkSplitMode,
    paragraphChunkDeep
  });

  const { rawText } = await readDatasetSourceRawText({
    teamId,
    tmbId,
    type,
    sourceId,
    selector,
    apiServer: dataset.apiServer,
    feishuShareServer: dataset.feishuShareServer,
    yuqueServer: dataset.yuqueServer,
    feishuKnowledgeServer: dataset.feishuKnowledgeServer,
    feishuPrivateServer: dataset.feishuPrivateServer,
    externalFileId,
    customPdfParse
  });

  const chunks = rawText2Chunks({
    rawText,
    chunkTriggerType,
    chunkTriggerMinSize,
    chunkSize,
    paragraphChunkDeep,
    paragraphChunkMinSize,
    maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
    overlapRatio,
    customReg: chunkSplitter ? [chunkSplitter] : []
  });

  return {
    chunks: chunks.slice(0, 10),
    total: chunks.length
  };
}
export default NextAPI(handler);
