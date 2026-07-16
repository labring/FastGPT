import { withNextCors } from '@fastgpt/next/middle/cors';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/types';
import { createApiEntry } from '@fastgpt/service/common/http/entry';
import { serviceEnv } from '@fastgpt/service/env';

export const NextAPI = createApiEntry<NextApiRequest, NextApiResponse>({
  beforeCallback: [
    (req, res) =>
      withNextCors({
        req,
        res,
        allowedOrigins: serviceEnv.ALLOWED_ORIGINS?.split(',')
      })
  ]
});
