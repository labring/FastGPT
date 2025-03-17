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
  customPdfParse?: boolean;

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
    externalFileId,
    customPdfParse = false
  } = req.body;

  if (!sourceId) {
    throw new Error('sourceId is empty');
  }
  if (chunkSize > 30000) {
    throw new Error('chunkSize is too large, should be less than 30000');
  }

  const { teamId, tmbId, apiServer, feishuServer, yuqueServer } = await (async () => {
    if (type === DatasetSourceReadTypeEnum.fileLocal) {
      const res = await authCollectionFile({
        req,
        authToken: true,
        authApiKey: true,
        fileId: sourceId,
        per: OwnerPermissionVal
      });
      return {
        teamId: res.teamId,
        tmbId: res.tmbId
      };
    }
    const { dataset, teamId, tmbId } = await authDataset({
      req,
      authApiKey: true,
      authToken: true,
      datasetId,
      per: WritePermissionVal
    });
    return {
      teamId,
      tmbId,
      apiServer: dataset.apiServer,
      feishuServer: dataset.feishuServer,
      yuqueServer: dataset.yuqueServer
    };
  })();

  const rawText = await readDatasetSourceRawText({
    teamId,
    tmbId,
    type,
    sourceId,
    selector,
    isQAImport,
    apiServer,
    feishuServer,
    yuqueServer,
    externalFileId,
    customPdfParse
  });

  return rawText2Chunks({
    rawText,
    chunkLen: chunkSize,
    overlapRatio,
    customReg: customSplitChar ? [customSplitChar] : [],
    isQAImport: isQAImport
  }).slice(0, 10);
}
export default NextAPI(handler);
