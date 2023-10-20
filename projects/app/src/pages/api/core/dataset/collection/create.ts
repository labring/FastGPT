/* 
    Create one dataset collection
*/

import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import type { CreateDatasetCollectionParams } from '@/global/core/api/datasetReq.d';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { getCollectionUpdateTime } from '@fastgpt/service/core/dataset/collection/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });

    const body = req.body || {};

    jsonRes(res, {
      data: await createOneCollection({
        ...body,
        userId
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function createOneCollection({
  name,
  parentId,
  datasetId,
  type,
  metadata = {},
  userId
}: CreateDatasetCollectionParams & { userId: string }) {
  const { _id } = await MongoDatasetCollection.create({
    name,
    userId,
    datasetId,
    parentId: parentId || null,
    type,
    metadata,
    updateTime: getCollectionUpdateTime({ name })
  });

  // create default collection
  if (type === DatasetCollectionTypeEnum.folder) {
    await createDefaultCollection({
      datasetId,
      parentId: _id,
      userId
    });
  }

  return _id;
}

// create default collection
export function createDefaultCollection({
  name = '手动录入',
  datasetId,
  parentId,
  userId
}: {
  name?: '手动录入' | '手动标注';
  datasetId: string;
  parentId?: string;
  userId: string;
}) {
  return MongoDatasetCollection.create({
    name,
    userId,
    datasetId,
    parentId,
    type: DatasetCollectionTypeEnum.virtual,
    updateTime: new Date('2000'),
    metadata: {}
  });
}
