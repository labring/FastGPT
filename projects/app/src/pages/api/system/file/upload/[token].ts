import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import z from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import { jwtVerifyS3UploadToken } from '@fastgpt/service/common/s3/security/token';
import { jsonRes } from '@fastgpt/service/common/response';
import { handleS3ProxyRouteError, handleS3ProxyUpload } from '@/service/common/s3/proxy';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const S3JwtUploadRouteQuerySchema = z.object({
  token: z.string().min(1)
});

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { token } = parseApiInput({
    req,
    querySchema: S3JwtUploadRouteQuerySchema
  }).query;

  try {
    const { objectKey, bucketName, maxSize, uploadConstraints, metadata } =
      await jwtVerifyS3UploadToken(token);

    return await handleS3ProxyUpload({
      req,
      payload: {
        objectKey,
        bucketName,
        maxSize,
        uploadConstraints,
        metadata
      }
    });
  } catch (error) {
    return handleS3ProxyRouteError({ res, error });
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
