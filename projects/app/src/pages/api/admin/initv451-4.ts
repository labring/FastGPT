import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { App, connectToDatabase } from '@/service/mongo';
import { PgClient } from '@/service/pg';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { PgDatasetTableName } from '@/constants/plugin';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { delay } from '@/utils/tools';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { GridFSStorage } from '@/service/lib/gridfs';
import { Types } from 'mongoose';

let success = 0;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();

    success = 0;
    console.log('update pg collectionId');
    await updatePgCollection(limit);
    console.log('init done');

    jsonRes(res, {
      data: {}
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function updatePgCollection(limit: number): Promise<any> {
  const collections = await MongoDatasetCollection.find({
    'metadata.pgCollectionId': { $exists: true, $ne: '' }
  }).lean();
  console.log('total:', collections.length);

  async function update(i: number): Promise<any> {
    const item = collections[i];
    if (!item) return;

    try {
      console.log('start', item.name, item.datasetId, item.metadata.pgCollectionId);
      const time = Date.now();
      if (item.metadata.pgCollectionId) {
        const { rows } = await PgClient.select(PgDatasetTableName, {
          fields: ['id'],
          where: [
            ['dataset_id', String(item.datasetId)],
            'AND',
            ['collection_id', String(item.metadata.pgCollectionId)]
          ],
          limit: 999999
        });
        console.log('update date total', rows.length, 'time:', Date.now() - time);

        await PgClient.query(`
    update ${PgDatasetTableName} set collection_id = '${item._id}' where dataset_id = '${String(
      item.datasetId
    )}' AND collection_id = '${String(item.metadata.pgCollectionId)}'
              `);

        console.log('pg update time', Date.now() - time);
      }

      // 更新 file id
      if (item.type === 'file' && item.metadata.fileId) {
        const collection = connectionMongo.connection.db.collection(`dataset.files`);
        await collection.findOneAndUpdate({ _id: new Types.ObjectId(item.metadata.fileId) }, [
          {
            $set: {
              'metadata.datasetId': item.datasetId,
              'metadata.collectionId': item._id
            }
          }
        ]);
      }

      await MongoDatasetCollection.findByIdAndUpdate(item._id, {
        $unset: { 'metadata.pgCollectionId': '' }
      });
      console.log('success', ++success);

      return update(i + limit);
    } catch (error) {
      console.log(error);

      await delay(5000);
      return update(i);
    }
  }

  const arr = new Array(limit).fill(0);

  return Promise.all(arr.map((_, i) => update(i)));
}
