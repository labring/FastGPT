import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { GridFSStorage } from '@/service/lib/gridfs';
import { authFileToken } from './readUrl';
import jschardet from 'jschardet';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { token } = req.query as { token: string };

    const { fileId, userId } = await authFileToken(token);

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const gridFs = new GridFSStorage('dataset', userId);

    const [file, buffer] = await Promise.all([
      gridFs.findAndAuthFile(fileId),
      gridFs.download(fileId)
    ]);

    const encoding = jschardet.detect(buffer)?.encoding;

    res.setHeader('Content-Type', `${file.contentType}; charset=${encoding}`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);

    res.end(buffer);
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
