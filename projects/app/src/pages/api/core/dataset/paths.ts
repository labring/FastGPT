import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { DatasetPathItemType } from '@/types/core/dataset';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { parentId } = req.query as { parentId: string };

    if (!parentId) {
      return jsonRes(res, {
        data: []
      });
    }

    await authDataset({ req, authToken: true, datasetId: parentId, per: 'r' });

    jsonRes<DatasetPathItemType[]>(res, {
      data: await getParents(parentId)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

async function getParents(parentId?: string): Promise<DatasetPathItemType[]> {
  if (!parentId) {
    return [];
  }

  const parent = await MongoDataset.findById(parentId, 'name parentId');

  if (!parent) return [];

  const paths = await getParents(parent.parentId);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}
