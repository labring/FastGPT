import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { kbId } = req.query as { kbId: string };
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const gridFs = new GridFSStorage('dataset', userId);
    const collection = gridFs.Collection();

    const files = await collection.deleteMany({
      uploadDate: { $lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      ['metadata.kbId']: kbId,
      ['metadata.userId']: userId,
      ['metadata.datasetUsed']: { $ne: true }
    });

    jsonRes(res, {
      data: files
    });
  } catch (err) {
    jsonRes(res);
  }
}
