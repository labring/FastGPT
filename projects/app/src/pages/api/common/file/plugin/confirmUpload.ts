import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { PluginS3Service } from '@fastgpt/service/common/s3';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { uploadSystemTool } from '@fastgpt/service/core/app/tool/api';

type PluginFileUploadQuery = {
  objectName: string;
};

async function handler(
  req: ApiRequestProps<{}, PluginFileUploadQuery>,
  res: NextApiResponse<string>
) {
  const { objectName } = req.query;

  // Verify file upload and get access URL
  await PluginS3Service.getFile(objectName);
  await uploadSystemTool(objectName);

  return {};
}

export default NextAPI(handler);
