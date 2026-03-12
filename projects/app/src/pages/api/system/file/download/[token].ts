import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { jwtVerifyS3DownloadToken } from '@fastgpt/service/common/s3/security/token';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import path from 'path';

const logger = getLogger(LogCategories.INFRA.FILE);

const parseRequestFilename = (filename?: string) => {
  if (!filename) return '';
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return Promise.reject('Method not allowed');
    }

    const { token, filename: queryFilename } = req.query as { token: string; filename?: string };
    const { objectKey, bucketName } = await jwtVerifyS3DownloadToken(token);

    const bucket = global.s3BucketMap[bucketName];
    if (!bucket) {
      return jsonRes(res, {
        code: 404,
        error: 'S3 bucket not found'
      });
    }

    const [stream, metadata] = await Promise.all([
      bucket.getFileStream(objectKey),
      bucket.getFileMetadata(objectKey)
    ]);

    if (!stream) {
      return jsonRes(res, {
        code: 404,
        error: 'File not found'
      });
    }

    if (metadata?.contentType) {
      res.setHeader('Content-Type', metadata.contentType);
    }
    if (metadata?.contentLength) {
      res.setHeader('Content-Length', metadata.contentLength);
    }
    const filename =
      parseRequestFilename(queryFilename) ||
      metadata?.filename ||
      path.basename(objectKey) ||
      'file';
    res.setHeader('Content-Disposition', getContentDisposition({ filename, type: 'inline' }));
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }

    stream.pipe(res);

    stream.on('error', (error) => {
      logger.error('Error reading proxy download stream', {
        objectKey,
        bucketName,
        error
      });
      if (!res.headersSent) {
        jsonRes(res, {
          code: 500,
          error
        });
      }
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
