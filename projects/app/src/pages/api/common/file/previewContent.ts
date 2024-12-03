/* 
    Read db file content and response 3000 words
*/
import type { NextApiResponse } from 'next';
import { authCollectionFile } from '@fastgpt/service/support/permission/auth/file';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  OwnerPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';

export type PreviewContextProps = {
  datasetId: string;
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  isQAImport?: boolean;
  selector?: string;
  externalFileId?: string;
};

async function handler(req: ApiRequestProps<PreviewContextProps>, res: NextApiResponse<any>) {
  const { type, sourceId, isQAImport, selector, datasetId, externalFileId } = req.body;

  if (!sourceId) {
    throw new Error('fileId is empty');
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
    isQAImport,
    selector,
    apiServer,
    externalFileId
  });

  return {
    previewContent: rawText.slice(0, 3000),
    totalLength: rawText.length
  };
}

export default NextAPI(handler);
