import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { GridFSStorage } from '@/service/lib/gridfs';
import { authFileToken } from './readUrl';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { token } = req.query as { token: string };

    const { fileId, userId } = await authFileToken(token);

    const gridFs = new GridFSStorage('dataset', userId);

    const [file, buffer] = await Promise.all([
      gridFs.findAndAuthFile(fileId),
      gridFs.download(fileId)
    ]);

    res.setHeader('encoding', file.encoding);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.end(buffer);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
