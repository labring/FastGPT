import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type GetUploadURLQuery = {
  filename: string;
};

export type GetUploadURLResponse = {
  postURL: string;
  formData: Record<string, string>;
  objectName: string;
};

async function handler(
  req: ApiRequestProps<{}, GetUploadURLQuery>,
  res: ApiResponseType<GetUploadURLResponse>
): Promise<GetUploadURLResponse> {
  await authCert({ req, authToken: true });

  const { filename } = req.query;

  if (!filename) {
    throw new Error('Filename is required');
  }

  const result = await pluginClient.tool.upload.getUploadURL({
    query: {
      filename
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  return result.body;
}

export default NextAPI(handler);
