/* 
    Read db file content and response 3000 words
*/
import type { NextApiResponse } from 'next';
import { authFile } from '@fastgpt/service/support/permission/auth/file';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';

export type PreviewContextProps = {
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  isQAImport?: boolean;
  selector?: string;
};

async function handler(req: ApiRequestProps<PreviewContextProps>, res: NextApiResponse<any>) {
  const { type, sourceId, isQAImport, selector } = req.body;

  if (!sourceId) {
    throw new Error('fileId is empty');
  }

  const { teamId } = await (async () => {
    if (type === DatasetSourceReadTypeEnum.fileLocal) {
      return authFile({
        req,
        authToken: true,
        authApiKey: true,
        fileId: sourceId,
        per: OwnerPermissionVal
      });
    }
    return authCert({ req, authApiKey: true, authToken: true });
  })();

  const rawText = await readDatasetSourceRawText({
    teamId,
    type,
    sourceId: sourceId,
    isQAImport,
    selector
  });

  return {
    previewContent: rawText.slice(0, 3000),
    totalLength: rawText.length
  };
}

export default NextAPI(handler);
