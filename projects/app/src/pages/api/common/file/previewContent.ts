/* 
    Read db file content and response 3000 words
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authFile } from '@fastgpt/service/support/permission/auth/file';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { fileId, csvFormat } = req.body as { fileId: string; csvFormat?: boolean };

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const { teamId } = await authFile({ req, authToken: true, fileId });

    const { rawText } = await readFileContentFromMongo({
      teamId,
      bucketName: BucketNameEnum.dataset,
      fileId,
      csvFormat
    });

    jsonRes(res, {
      data: {
        previewContent: rawText.slice(0, 3000),
        totalLength: rawText.length
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
