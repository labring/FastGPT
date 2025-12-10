import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { stream2Encoding } from '@fastgpt/service/common/file/gridfs/utils';
import { authFileToken } from '@fastgpt/service/support/permission/auth/file';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';

const previewableExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'txt',
  'log',
  'csv',
  'md',
  'json'
];
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { token, filename } = req.query as { token: string; filename: string };

    const { fileId } = await authFileToken(token);

    if (!fileId || !isS3ObjectKey(fileId, 'dataset')) {
      throw new Error('Invalid fileId');
    }

    const [file, fileStream] = await Promise.all([
      getS3DatasetSource().getFileMetadata(fileId),
      getS3DatasetSource().getFileStream(fileId)
    ]);

    if (!file) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    const { stream, encoding } = await stream2Encoding(fileStream);

    const extension = file.extension;
    const disposition = previewableExtensions.includes(extension) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(filename)}"`
    );
    res.setHeader('Content-Length', file.contentLength);

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
