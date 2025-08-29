import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { PluginS3Service } from '@fastgpt/service/common/s3';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { uploadSystemTool } from '@fastgpt/service/core/app/tool/api';
import { cleanSystemPluginCache } from '@fastgpt/service/core/app/plugin/controller';

type PluginFileUploadQuery = {
  objectName: string;
};

async function handler(
  req: ApiRequestProps<{}, PluginFileUploadQuery>,
  res: NextApiResponse<string>
) {
  const { objectName } = req.query;

  // Verify file upload and get access URL
  // const accessUrl = await confirmPresignedUpload(objectName, size);
  const url = await PluginS3Service.getFile(objectName);

  const result = await uploadSystemTool(objectName);

  cleanSystemPluginCache();

  return url;
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
