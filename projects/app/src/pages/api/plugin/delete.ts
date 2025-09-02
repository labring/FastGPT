import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteSystemTool } from '@fastgpt/service/core/app/tool/api';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const toolId = (req.query.toolId as string) || req.body?.toolId;

  if (!toolId) {
    return Promise.reject('ToolId is required');
  }

  const actualToolId = toolId.includes('-') ? toolId.split('-').slice(1).join('-') : toolId;

  const result = await deleteSystemTool(actualToolId);

  return result;
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
