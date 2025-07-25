import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { uploadSystemTool } from '@fastgpt/service/core/app/tool/api';
import { cleanSystemPluginCache } from '@fastgpt/service/core/app/plugin/controller';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { url } = req.body;

  if (!url) {
    return Promise.reject('URL is required');
  }

  const result = await uploadSystemTool(url);

  cleanSystemPluginCache();

  return result;
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
