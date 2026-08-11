import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { multer } from '@fastgpt/service/common/file/multer';
import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';
import {
  InvokeFileUploadBodySchema,
  InvokeFileUploadResponseSchema,
  type InvokeFileUploadBodyType,
  type InvokeFileUploadResponseType
} from '@fastgpt/global/openapi/plugin/invoke';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: NextApiRequest): Promise<InvokeFileUploadResponseType> {
  if (req.method !== 'POST') {
    return Promise.reject('Method not allowed');
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return Promise.reject('Content-Type must be multipart/form-data');
  }

  const token = req.headers.authorization?.split(' ')[1] || '';
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData<InvokeFileUploadBodyType>({
      request: req,
      maxFileSize: global.feConfigs?.uploadFileMaxSize
    });
    filepaths.push(result.fileMetadata.path);

    const { body } = parseApiInput({
      req: { body: result.data },
      bodySchema: InvokeFileUploadBodySchema
    });

    const filename =
      body.fileName ??
      (decodeURIComponent(result.fileMetadata.originalname) || `file-${getNanoid()}`);

    const uploadResult = await InvokeProcessor.getInstanceFromToken(token).handleFileUpload({
      filename,
      body: result.getReadStream(),
      contentType: result.fileMetadata.mimetype
    });

    return InvokeFileUploadResponseSchema.parse(uploadResult);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
