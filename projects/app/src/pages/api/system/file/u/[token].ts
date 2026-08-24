import type { ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  S3UploadAccessRouteQuerySchema,
  verifyS3UploadSessionToken
} from '@fastgpt/service/common/s3/accessLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  handleS3ProxyRouteError,
  handleS3ProxyUpload,
  handleS3ProxyUploadPart
} from '@/service/common/s3/proxy';
import { jsonRes } from '@fastgpt/service/common/response';
import {
  UploadDatasetFileMultipartPartQuerySchema,
  UploadDatasetFileMultipartPartResponseSchema
} from '@fastgpt/global/openapi/core/dataset/file/api';

const S3UploadAccessRouteWithPartQuerySchema = S3UploadAccessRouteQuerySchema.extend({
  partNumber: UploadDatasetFileMultipartPartQuerySchema.shape.partNumber.optional()
});

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { token, partNumber } = parseApiInput({
    req,
    querySchema: S3UploadAccessRouteWithPartQuerySchema
  }).query;

  try {
    const payload = await verifyS3UploadSessionToken(token);

    if (partNumber !== undefined) {
      if (!payload.multipart) {
        throw new Error('Not a multipart upload session');
      }

      return UploadDatasetFileMultipartPartResponseSchema.parse(
        await handleS3ProxyUploadPart({ req, res, token, payload, partNumber })
      );
    }

    if (payload.multipart) {
      throw new Error('Multipart upload requires partNumber');
    }

    return await handleS3ProxyUpload({ req, payload });
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
