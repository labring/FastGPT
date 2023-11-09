/* 
    Create one dataset collection
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateDatasetCollectionParams } from '@/global/core/api/datasetReq.d';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { getCollectionUpdateTime } from '@fastgpt/service/core/dataset/collection/utils';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const body = req.body as CreateDatasetCollectionParams;

    // auth. not visitor and dataset is public
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });
    await authDataset({
      req,
      authToken: true,
      datasetId: body.datasetId,
      per: 'r'
    });

    jsonRes(res, {
      data: await createOneCollection({
        ...body,
        teamId,
        tmbId
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
  teamId,
  tmbId
}: CreateDatasetCollectionParams & { teamId: string; tmbId: string }) {
  const { _id } = await MongoDatasetCollection.create({
    name,
    teamId,
    tmbId,
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
      teamId,
      tmbId
    });
  }

  return _id;
}

// create default collection
export function createDefaultCollection({
  name = '手动录入',
  datasetId,
  parentId,
  teamId,
  tmbId
}: {
  name?: '手动录入' | '手动标注';
  datasetId: string;
  parentId?: string;
  teamId: string;
  tmbId: string;
}) {
  return MongoDatasetCollection.create({
    name,
    teamId,
    tmbId,
    datasetId,
    parentId,
    type: DatasetCollectionTypeEnum.virtual,
    updateTime: new Date('2099'),
    metadata: {}
  });
}
