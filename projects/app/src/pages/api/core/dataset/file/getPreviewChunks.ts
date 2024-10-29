import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authFile } from '@fastgpt/service/support/permission/auth/file';

export type PostPreviewFilesChunksProps = {
  type: DatasetSourceReadTypeEnum;
  sourceId: string;
  chunkSize: number;
  overlapRatio: number;
  customSplitChar?: string;
  selector?: string;
  isQAImport?: boolean;
};
export type PreviewChunksResponse = {
  q: string;
  a: string;
}[];

async function handler(
  req: ApiRequestProps<PostPreviewFilesChunksProps>
): Promise<PreviewChunksResponse> {
  const { type, sourceId, chunkSize, customSplitChar, overlapRatio, selector, isQAImport } =
    req.body;

  if (!sourceId) {
    throw new Error('sourceId is empty');
  }
  if (chunkSize > 30000) {
    throw new Error('chunkSize is too large, should be less than 30000');
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
    selector,
    isQAImport
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
