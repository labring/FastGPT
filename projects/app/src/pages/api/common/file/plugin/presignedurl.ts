import type { NextApiRequest, NextApiResponse } from 'next';
import {
  generatePresignedUrl,
  initFileUploadService
} from '@fastgpt/service/common/file/plugin/controller';
import { NextAPI } from '@/service/middleware/entry';

type RequestBody = {
  filename: string;
  contentType?: string;
  metadata?: Record<string, string>;
  maxSize?: number;
  expires?: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await initFileUploadService({
      bucket: 'fastgpt-uploads',
      allowedExtensions: ['.js']
    });

    const { filename, contentType, metadata, maxSize }: RequestBody = req.body;

    if (!filename) {
      return Promise.reject('Filename is required');
    }

    const presignedData = await generatePresignedUrl({
      filename,
      contentType,
      metadata,
      maxSize: maxSize || 10 * 1024 * 1024 // default 10MB
    });

    return presignedData;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
