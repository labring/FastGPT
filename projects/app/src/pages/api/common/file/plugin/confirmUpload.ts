import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { PluginS3Service } from '@fastgpt/service/common/s3';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

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

  return url;
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
