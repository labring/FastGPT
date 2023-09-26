import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { MarkFileUsedProps } from '@/api/core/dataset/file.d';
import { Types } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { fileIds } = req.body as MarkFileUsedProps;
    const { userId } = await authUser({ req, authToken: true });

    const gridFs = new GridFSStorage('dataset', userId);
    const collection = gridFs.Collection();

    await collection.updateMany(
      {
        _id: { $in: fileIds.filter((id) => !!id).map((id) => new Types.ObjectId(id)) },
        ['metadata.userId']: userId
      },
      {
        $set: {
          ['metadata.datasetUsed']: true
        }
      }
    );

    jsonRes(res, {});
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
