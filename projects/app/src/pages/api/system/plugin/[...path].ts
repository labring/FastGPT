import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { S3Buckets } from '@fastgpt/service/common/s3/constants';
import type { S3PublicBucket } from '@fastgpt/service/common/s3/buckets/public';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { path = [] } = req.query as { path: ['models' | 'tools', string] };

    const bucket = global.s3BucketMap[S3Buckets.public] as S3PublicBucket;

    const baseUrl = `system/plugin/${path.join('/')}`.split('.')[0];
    const requestPath = bucket.createPublicUrl(`${baseUrl}/logo`);

    res.redirect(requestPath);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};
