import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authFileToken } from '@fastgpt/service/support/permission/controller';
import { getDownloadStream, getFileById } from '@fastgpt/service/common/file/gridfs/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { stream2Encoding } from '@fastgpt/service/common/file/gridfs/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { token } = req.query as { token: string };

    const { fileId, bucketName } = await authFileToken(token);

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const [file, fileStream] = await Promise.all([
      getFileById({ bucketName, fileId }),
      getDownloadStream({ bucketName, fileId })
    ]);

    if (!file) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    const { stream, encoding } = await (async () => {
      if (file.metadata?.encoding) {
        return {
          stream: fileStream,
          encoding: file.metadata.encoding
        };
      }
      return stream2Encoding(fileStream);
    })();

    res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);

    stream.pipe(res);

    stream.on('error', () => {
      res.status(500).end();
    });
    stream.on('end', () => {
      res.end();
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
export const config = {
  api: {
    responseLimit: '100mb'
  }
};
