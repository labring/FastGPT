import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import {
  S3DownloadAccessRouteQuerySchema,
  verifyS3DownloadAccess
} from '@fastgpt/service/common/s3/accessLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { handleS3ProxyDownload, handleS3ProxyRouteError } from '@/service/common/s3/proxy';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { signedAlias } = parseApiInput({
    req,
    querySchema: S3DownloadAccessRouteQuerySchema
  }).query;

  try {
    const payload = await verifyS3DownloadAccess(signedAlias);

    return await handleS3ProxyDownload({ req, res, payload });
  } catch (error) {
    return handleS3ProxyRouteError({ res, error });
  }
}

export default NextAPI(handler);
