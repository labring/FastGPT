import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authFileToken } from '@fastgpt/service/support/permission/controller';
import jschardet from 'jschardet';
import { getDownloadBuf, getFileById } from '@fastgpt/service/common/file/gridfs/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { token } = req.query as { token: string };

    const { fileId, teamId, tmbId, bucketName } = await authFileToken(token);

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const [file, buffer] = await Promise.all([
      getFileById({ bucketName, fileId }),
      getDownloadBuf({ bucketName, fileId })
    ]);

    const encoding = jschardet.detect(buffer)?.encoding;

    res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);

    res.end(buffer);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
export const config = {
  api: {
    responseLimit: '32mb'
  }
};
