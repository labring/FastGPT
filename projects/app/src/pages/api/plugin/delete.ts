import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { deleteSystemTool } from '@fastgpt/service/core/app/tool/api';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(req: ApiRequestProps<{}, { toolId: string }>, res: NextApiResponse<any>) {
  const { toolId } = req.query;

  if (!toolId) {
    return Promise.reject('ToolId is required');
  }

  return deleteSystemTool(toolId.split('-').slice(1).join('-'));
}

export default NextAPI(handler);
