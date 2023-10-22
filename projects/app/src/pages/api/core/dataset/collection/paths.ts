import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import type { DatasetPathItemType } from '@/types/core/dataset';
import { getDatasetCollectionPaths } from '@fastgpt/service/core/dataset/collection/utils';
import { authUser } from '@fastgpt/service/support/user/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { parentId } = req.query as { parentId: string };

    const { userId } = await authUser({ req, authToken: true });
    const paths = await getDatasetCollectionPaths({
      parentId,
      userId
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
