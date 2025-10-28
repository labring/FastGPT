import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type ParseUploadedToolQuery = {
  objectName: string;
};

export type ParseUploadedToolResponse = Array<{
  toolId: string;
  name: {
    'zh-CN'?: string;
    en: string;
  };
  description: {
    'zh-CN'?: string;
    en: string;
  };
  icon: string;
  parentId?: string;
  tags?: string[];
}>;

async function handler(
  req: ApiRequestProps<{}, ParseUploadedToolQuery>,
  res: ApiResponseType<ParseUploadedToolResponse>
): Promise<ParseUploadedToolResponse> {
  await authCert({ req, authToken: true });

  const { objectName } = req.query;

  if (!objectName) {
    throw new Error('Object name is required');
  }

  const result = await pluginClient.tool.upload.parseUploadedTool({
    query: {
      objectName
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  return result.body;
}

export default NextAPI(handler);
