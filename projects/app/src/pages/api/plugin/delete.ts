import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { NextAPI } from '@/service/middleware/entry';
import { deleteSystemTool } from '@fastgpt/service/core/app/tool/api';
import { cleanSystemPluginCache } from '@fastgpt/service/core/app/plugin/controller';

type RequestBody = {
  toolId: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { toolId }: RequestBody = req.body;

    if (!toolId) {
      return Promise.reject('ToolId is required');
    }

    const actualToolId = toolId.includes('-') ? toolId.split('-').slice(1).join('-') : toolId;

    const result = await deleteSystemTool(actualToolId);

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
