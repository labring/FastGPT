import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authFileToken } from '@fastgpt/service/support/permission/controller';
import { detect } from 'jschardet';
import { getDownloadStream, getFileById } from '@fastgpt/service/common/file/gridfs/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { token } = req.query as { token: string };

    const { fileId, bucketName } = await authFileToken(token);

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const [file, encodeStream] = await Promise.all([
      getFileById({ bucketName, fileId }),
      getDownloadStream({ bucketName, fileId })
    ]);

    // get encoding
    let buffers: Buffer = Buffer.from([]);
    for await (const chunk of encodeStream) {
      buffers = Buffer.concat([buffers, chunk]);
      if (buffers.length > 10) {
        encodeStream.abort();
        break;
      }
    }

    const encoding = detect(buffers)?.encoding || 'utf-8';

    res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);

    const fileStream = await getDownloadStream({ bucketName, fileId });

    fileStream.pipe(res);

    fileStream.on('error', () => {
      res.status(500).end();
    });
    fileStream.on('end', () => {
      res.end();
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
export const config = {
  api: {
    responseLimit: '32mb'
  }
};
