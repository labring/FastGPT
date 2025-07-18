import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { confirmPresignedUpload } from '@fastgpt/service/common/file/plugin/controller';

type RequestBody = {
  objectName: string;
  size: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { objectName, size }: RequestBody = req.body;

    // Verify file upload and get access URL
    const accessUrl = await confirmPresignedUpload(objectName, size);

    return accessUrl;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: true
  }
};
