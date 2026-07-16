import type { ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import z from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import { jwtVerifyS3DownloadToken } from '@fastgpt/service/common/s3/security/token';
import { jsonRes } from '@fastgpt/service/common/response';
import { handleS3ProxyDownload, handleS3ProxyRouteError } from '@/service/common/s3/proxy';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const S3JwtDownloadRouteQuerySchema = z.object({
  token: z.string().min(1),
  filename: z.string().min(1).optional()
});

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { token, filename } = parseApiInput({
    req,
    querySchema: S3JwtDownloadRouteQuerySchema
  }).query;

  try {
    const { objectKey, bucketName } = await jwtVerifyS3DownloadToken(token);

    return await handleS3ProxyDownload({
      req,
      res,
      payload: {
        objectKey,
        bucketName,
        filename
      }
    });
  } catch (error) {
    return handleS3ProxyRouteError({ res, error });
  }
}

export default NextAPI(handler);
