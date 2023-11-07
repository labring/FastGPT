import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { DatasetPathItemType } from '@/types/core/dataset';
import { getDatasetCollectionPaths } from '@fastgpt/service/core/dataset/collection/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { parentId } = req.query as { parentId: string };

    if (!parentId) {
      return jsonRes(res, {
        data: []
      });
    }

    await authDatasetCollection({ req, authToken: true, collectionId: parentId, per: 'r' });
    const paths = await getDatasetCollectionPaths({
      parentId
    });

    jsonRes<DatasetPathItemType[]>(res, {
      data: paths
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
