import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import type { DatasetDataItemType, PgDataItemType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export type Response = {
  id: string;
  q: string;
  a: string;
  source: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    let { dataId } = req.query as {
      dataId: string;
    };
    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    jsonRes(res, {
      data: await getDatasetDataById({ userId, id: dataId })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function getDatasetDataById({
  id,
  userId
}: {
  id: string;
  userId: string;
}): Promise<DatasetDataItemType> {
  const where: any = [['user_id', userId], 'AND', ['id', id]];

  const searchRes = await PgClient.select<PgDataItemType>(PgDatasetTableName, {
    fields: ['id', 'q', 'a', 'dataset_id', 'collection_id'],
    where,
    limit: 1
  });

  const data = searchRes?.rows?.[0];

  if (!data) {
    return Promise.reject('Data not found');
  }

  // find source
  const collection = (await getDatasetDataItemInfo({ pgDataList: [data] }))[0];

  if (!collection) {
    return Promise.reject('Data Collection not found');
  }

  return {
    id: data.id,
    q: data.q,
    a: data.a,
    datasetId: data.dataset_id,
    collectionId: data.collection_id,
    sourceName: collection.sourceName,
    sourceId: collection.sourceId
  };
}

export async function getDatasetDataItemInfo({
  pgDataList
}: {
  pgDataList: PgDataItemType[];
}): Promise<DatasetDataItemType[]> {
  const collections = await MongoDatasetCollection.find(
    {
      _id: { $in: pgDataList.map((item) => item.collection_id) }
    },
    '_id name datasetId metadata'
  ).lean();

  return pgDataList.map((item) => {
    const collection = collections.find(
      (collection) => String(collection._id) === item.collection_id
    );
    return {
      id: item.id,
      q: item.q,
      a: item.a,
      datasetId: collection?.datasetId || '',
      collectionId: item.collection_id,
      sourceName: collection?.name || '',
      sourceId: collection?.metadata?.fileId || collection?.metadata?.rawLink
    };
  });
}
