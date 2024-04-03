import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { authFile } from '@fastgpt/service/support/permission/auth/file';
import { PostPreviewFilesChunksProps } from '@/global/core/dataset/api';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { parseCsvTable2Chunks } from '@fastgpt/service/core/dataset/training/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { type, sourceId, chunkSize, customSplitChar, overlapRatio } =
      req.body as PostPreviewFilesChunksProps;

    if (!sourceId) {
      throw new Error('fileIdList is empty');
    }
    if (chunkSize > 30000) {
      throw new Error('chunkSize is too large, should be less than 30000');
    }

    const { chunks } = await (async () => {
      if (type === ImportDataSourceEnum.fileLocal) {
        const { file, teamId } = await authFile({ req, authToken: true, fileId: sourceId });
        const fileId = String(file._id);

        const { rawText } = await readFileContentFromMongo({
          teamId,
          bucketName: BucketNameEnum.dataset,
          fileId,
          csvFormat: true
        });
        // split chunks (5 chunk)
        const sliceRawText = 10 * chunkSize;
        const { chunks } = splitText2Chunks({
          text: rawText.slice(0, sliceRawText),
          chunkLen: chunkSize,
          overlapRatio,
          customReg: customSplitChar ? [customSplitChar] : []
        });

        return {
          chunks: chunks.map((item) => ({
            q: item,
            a: ''
          }))
        };
      }
      if (type === ImportDataSourceEnum.csvTable) {
        const { file, teamId } = await authFile({ req, authToken: true, fileId: sourceId });
        const fileId = String(file._id);
        const { rawText } = await readFileContentFromMongo({
          teamId,
          bucketName: BucketNameEnum.dataset,
          fileId,
          csvFormat: false
        });
        const { chunks } = parseCsvTable2Chunks(rawText);

        return {
          chunks: chunks || []
        };
      }
      return { chunks: [] };
    })();

    jsonRes<{ q: string; a: string }[]>(res, {
      data: chunks.slice(0, 5)
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
