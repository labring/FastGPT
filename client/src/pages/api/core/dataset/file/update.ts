import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { GridFSStorage } from '@/service/lib/gridfs';
import { UpdateFileProps } from '@/api/core/dataset/file.d';
import { Types } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { id, name, datasetUsed } = req.body as UpdateFileProps;
    const { userId } = await authUser({ req, authToken: true });

    const gridFs = new GridFSStorage('dataset', userId);
    const collection = gridFs.Collection();

    await collection.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id)
      },
      {
        $set: {
          ...(name && { filename: name }),
          ...(datasetUsed && { ['metadata.datasetUsed']: datasetUsed })
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
