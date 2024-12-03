import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  OwnerPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authCollectionFile } from '@fastgpt/service/support/permission/auth/file';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

export type PostPreviewFilesChunksProps = {
  datasetId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;

  chunkSize: number;
  overlapRatio: number;
  customSplitChar?: string;

  // Read params
  selector?: string;
  isQAImport?: boolean;
  externalFileId?: string;
};
export type PreviewChunksResponse = {
  q: string;
  a: string;
}[];

async function handler(
  req: ApiRequestProps<PostPreviewFilesChunksProps>
): Promise<PreviewChunksResponse> {
  const {
    type,
    sourceId,
    chunkSize,
    customSplitChar,
    overlapRatio,
    selector,
    isQAImport,
    datasetId,
    externalFileId
  } = req.body;

  if (!sourceId) {
    throw new Error('sourceId is empty');
  }
  if (chunkSize > 30000) {
    throw new Error('chunkSize is too large, should be less than 30000');
  }

  const { teamId, apiServer } = await (async () => {
    if (type === DatasetSourceReadTypeEnum.fileLocal) {
      const res = await authCollectionFile({
        req,
        authToken: true,
        authApiKey: true,
        fileId: sourceId,
        per: OwnerPermissionVal
      });
      return {
        teamId: res.teamId
      };
    }
    const { dataset } = await authDataset({
      req,
      authApiKey: true,
      authToken: true,
      datasetId,
      per: WritePermissionVal
    });
    return {
      teamId: dataset.teamId,
      apiServer: dataset.apiServer
    };
  })();

  const rawText = await readDatasetSourceRawText({
    teamId,
    type,
    sourceId,
    selector,
    isQAImport,
    apiServer,
    externalFileId
  });

  return rawText2Chunks({
    rawText,
    chunkLen: chunkSize,
    overlapRatio,
    customReg: customSplitChar ? [customSplitChar] : [],
    isQAImport: isQAImport
  }).slice(0, 15);
}
export default NextAPI(handler);
