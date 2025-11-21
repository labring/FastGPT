import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { getS3DatasetSource, S3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { addLog } from '@fastgpt/service/common/system/log';
import { jwtVerifyS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { jwt } = req.query as { jwt: string };

    const s3DatasetSource = getS3DatasetSource();
    const s3ChatSource = getS3ChatSource();

    const { objectKey } = await jwtVerifyS3ObjectKey(jwt);

    if (S3DatasetSource.isDatasetObjectKey(objectKey) || s3ChatSource.isChatFileKey(objectKey)) {
      try {
        const [stream, metadata] = await Promise.all(
          (() => {
            if (S3DatasetSource.isDatasetObjectKey(objectKey)) {
              return [
                s3DatasetSource.getDatasetFileStream(objectKey),
                s3DatasetSource.getFileMetadata(objectKey)
              ];
            } else {
              return [
                s3ChatSource.getChatFileStream(objectKey),
                s3ChatSource.getFileMetadata(objectKey)
              ];
            }
          })()
        );

        res.setHeader('Content-Type', metadata.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Content-Length', metadata.contentLength);

        stream.pipe(res);

        stream.on('error', (error) => {
          addLog.error('Error reading dataset file', { error });
          if (!res.headersSent) {
            return jsonRes(res, {
              code: 500,
              error
            });
          }
        });

        stream.on('end', () => {
          res.end();
        });

        return;
      } catch (error) {
        return jsonRes(res, {
          code: 500,
          error
        });
      }
    }

    jsonRes(res, {
      code: 404,
      error: 'File not found'
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
