import type { ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { S3UploadAccessRouteQuerySchema } from '@fastgpt/service/common/s3/accessLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AbortDatasetFileMultipartUploadResponseSchema } from '@fastgpt/global/openapi/core/dataset/file/api';
import { handleS3AbortMultipartUpload, handleS3ProxyRouteError } from '@/service/common/s3/proxy';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: ApiRequestProps, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { token } = parseApiInput({
    req,
    querySchema: S3UploadAccessRouteQuerySchema
  }).query;

  try {
    await handleS3AbortMultipartUpload(token);
    return AbortDatasetFileMultipartUploadResponseSchema.parse(undefined);
  } catch (error) {
    return handleS3ProxyRouteError({ res, error });
  }
}

export default NextAPI(handler);
