import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { fileId } = req.query as { fileId: string };

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const { userId } = await authUser({ req });

    const gridFs = new GridFSStorage('dataset', userId);

    const [file, buffer] = await Promise.all([
      gridFs.findAndAuthFile(fileId),
      gridFs.download(fileId)
    ]);

    res.setHeader('encoding', file.encoding);
    res.setHeader('Content-Type', file.contentType);

    res.end(buffer);
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
