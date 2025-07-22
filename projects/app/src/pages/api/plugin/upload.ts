import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { uploadSystemTool } from '@fastgpt/service/core/app/tool/api';
import { cleanSystemPluginCache } from '@fastgpt/service/core/app/plugin/controller';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { url } = req.body;

    if (!url) {
      return Promise.reject('URL is required');
    }

    const result = await uploadSystemTool(url);

    try {
      await cleanSystemPluginCache();
    } catch (error) {
      console.error('Clear plugin cache error:', error);
    }

    return jsonRes(res, result);
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
