import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { stream2Encoding } from '@fastgpt/service/common/file/gridfs/utils';
import { authFileToken } from '@fastgpt/service/support/permission/auth/file';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { pipeline } from 'node:stream/promises';
import { createS3DownloadAbortContext } from '@/service/common/s3/proxy';

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
  const abortContext = createS3DownloadAbortContext({ req, res });
  let fileStream: Awaited<ReturnType<ReturnType<typeof getS3DatasetSource>['getFileStream']>>;

  try {
    const { token, filename } = req.query as { token: string; filename: string };

    const { fileId } = await authFileToken(token);

    if (!fileId || !isS3ObjectKey(fileId, 'dataset')) {
      throw new Error('Invalid fileId');
    }

    const datasetSource = getS3DatasetSource();
    if (req.method === 'HEAD') {
      const file = await datasetSource.getFileMetadata(fileId);
      if (!file) return Promise.reject(CommonErrEnum.fileNotFound);

      const disposition = previewableExtensions.includes(file.extension) ? 'inline' : 'attachment';
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Content-Disposition', getContentDisposition({ filename, type: disposition }));
      if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
      res.status(200).end();
      return;
    }

    const [file, downloadStream] = await Promise.all([
      datasetSource.getFileMetadata(fileId),
      datasetSource.getFileStream(fileId, { abortSignal: abortContext.signal }).then((value) => {
        fileStream = value;
        return value;
      })
    ]);

    if (!file || !downloadStream) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    const { stream, encoding } = await stream2Encoding(downloadStream);

    const extension = file.extension;
    const disposition = previewableExtensions.includes(extension) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Content-Disposition', getContentDisposition({ filename, type: disposition }));
    if (file.contentLength) {
      res.setHeader('Content-Length', file.contentLength);
    }

    await pipeline(stream, res, { signal: abortContext.signal });
  } catch (error) {
    if (abortContext.isClientAborted()) return;

    abortContext.abort(error);
    if (fileStream && !fileStream.destroyed) {
      fileStream.destroy(error instanceof Error ? error : undefined);
    }
    jsonRes(res, {
      code: 500,
      error
    });
  } finally {
    abortContext.cleanup();
  }
}
export const config = {
  api: {
    responseLimit: '100mb'
  }
};
