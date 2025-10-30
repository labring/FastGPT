import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';

export type ConfirmUploadBody = {
  toolIds: string[];
};

export type ConfirmUploadResponse = {};

async function handler(
  req: ApiRequestProps<ConfirmUploadBody, {}>,
  res: ApiResponseType<ConfirmUploadResponse>
): Promise<ConfirmUploadResponse> {
  await authCert({ req, authToken: true });

  const { toolIds } = req.body;

  if (!toolIds || toolIds.length === 0) {
    throw new Error('Tool IDs are required');
  }

  const result = await pluginClient.tool.upload.confirmUpload({
    body: {
      toolIds
    }
  });

  if (result.status !== 200) {
    return Promise.reject(result.body);
  }

  return result.body;
}

export default NextAPI(handler);
