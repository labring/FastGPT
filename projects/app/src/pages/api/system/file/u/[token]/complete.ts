import type { ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { S3UploadAccessRouteQuerySchema } from '@fastgpt/service/common/s3/accessLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CompleteDatasetFileMultipartUploadBodySchema,
  CompleteDatasetFileMultipartUploadResponseSchema,
  type CompleteDatasetFileMultipartUploadResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';
import {
  handleS3CompleteMultipartUpload,
  handleS3ProxyRouteError
} from '@/service/common/s3/proxy';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<CompleteDatasetFileMultipartUploadResponse | void> {
  if (req.method !== 'POST') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { query, body } = parseApiInput({
    req,
    querySchema: S3UploadAccessRouteQuerySchema,
    bodySchema: CompleteDatasetFileMultipartUploadBodySchema
  });
  const { token } = query;
  const { parts } = body;

  try {
    const result = await handleS3CompleteMultipartUpload({ token, parts });
    return CompleteDatasetFileMultipartUploadResponseSchema.parse(result);
  } catch (error) {
    return handleS3ProxyRouteError({ res, error });
  }
}

export default NextAPI(handler);
