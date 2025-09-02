import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { PluginS3Service } from '@fastgpt/service/common/s3';
import { mimeMap } from '@fastgpt/service/common/s3/const';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { UploadPresignedURLResponse } from '@fastgpt/service/common/s3/type';

export type getUploadURLQuery = {
  filename: string;
};

async function handler(
  req: ApiRequestProps<{}, getUploadURLQuery>,
  res: NextApiResponse<UploadPresignedURLResponse>
) {
  const { filename } = req.query;

  if (!filename) {
    return Promise.reject('Filename is required');
  }

  const presignedData = await PluginS3Service.generateUploadPresignedURL({
    filepath: 'tools',
    contentType: mimeMap['.js'],
    filename
  });

  return presignedData;
}

export default NextAPI(handler);
