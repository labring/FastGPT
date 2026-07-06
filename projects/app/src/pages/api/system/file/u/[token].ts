import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  S3UploadAccessRouteQuerySchema,
  verifyS3UploadSessionToken
} from '@fastgpt/service/common/s3/accessLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { handleS3ProxyRouteError, handleS3ProxyUpload } from '@/service/common/s3/proxy';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { token } = parseApiInput({
    req,
    querySchema: S3UploadAccessRouteQuerySchema
  }).query;

  try {
    const payload = await verifyS3UploadSessionToken(token);

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
