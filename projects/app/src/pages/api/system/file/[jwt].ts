/* @deprecated 仅兼容旧 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import {
  verifyToken,
  type S3ObjectKeyTokenPayload,
  isS3ObjectKeyTokenPayload
} from '@fastgpt/service/common/s3/security/token';
import { handleS3ProxyDownload, handleS3ProxyRouteError } from '@/service/common/s3/proxy';

/* ==================== 旧版 objectKey token 兼容 ==================== */
export function jwtVerifyS3ObjectKey(token: string) {
  return verifyToken<S3ObjectKeyTokenPayload>(token, isS3ObjectKeyTokenPayload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { jwt } = req.query as { jwt: string };

    const s3DatasetSource = getS3DatasetSource();
    const s3ChatSource = getS3ChatSource();

    const { objectKey } = await jwtVerifyS3ObjectKey(jwt);

    if (isS3ObjectKey(objectKey, 'dataset') || isS3ObjectKey(objectKey, 'chat')) {
      try {
        const bucket = isS3ObjectKey(objectKey, 'dataset') ? s3DatasetSource : s3ChatSource;

        return await handleS3ProxyDownload({
          req,
          res,
          payload: {
            objectKey,
            bucketName: bucket.bucketName
          }
        });
      } catch (error) {
        return handleS3ProxyRouteError({ res, error });
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
