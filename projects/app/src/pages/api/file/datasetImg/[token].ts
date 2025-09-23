import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authDatasetImagePreviewUrl } from '@fastgpt/service/core/dataset/image/utils';
import { getDatasetImageReadData } from '@fastgpt/service/core/dataset/image/controller';

export default async function handler(
  req: ApiRequestProps<
    {},
    {
      token: string;
    }
  >,
  res: NextApiResponse<any>
) {
  try {
    const { token } = req.query;

    if (!token) {
      return jsonRes(res, {
        code: 401,
        error: 'ImageId not found'
      });
    }

    const formatToken = token.replace(/\.jpeg$/, '');

    // Verify token and permissions
    const { imageId } = await authDatasetImagePreviewUrl(formatToken);

    const { fileInfo, stream } = await getDatasetImageReadData(imageId);

    // Set response headers
    res.setHeader('Content-Type', fileInfo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Content-Length', fileInfo.length);

    stream.pipe(res);
    stream.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
    stream.on('end', () => {
      res.end();
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
