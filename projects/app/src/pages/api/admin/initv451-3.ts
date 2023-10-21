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

let successApp = 0;
let successCollection = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();
    console.log('create collection');

    await createCollection(limit);

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

async function createCollection(limit: number) {
  const { rows, rowCount } = await PgClient.query(`SELECT user_id,dataset_id,collection_id
  FROM ${PgDatasetTableName} 
  GROUP BY user_id,collection_id, dataset_id
  ORDER BY dataset_id`);

  if (rowCount === 0) {
    console.log('pg done');
    return;
  }

  // 50 个一组进行遍历
  const arr: { user_id: string; dataset_id: string; collection_id: string }[][] = [];
  for (let i = 0; i < rows.length; i += 50) {
    arr.push(rows.slice(i, i + 50));
  }

  // collectionId 的类型：manual, mark, httpLink, fileId
  async function initCollection(): Promise<any> {
    successCollection = 0;
    try {
      for await (const rowsData of arr) {
        await Promise.all(
          rowsData.map(async (row) => {
            const userId = row.user_id;
            const datasetId = row.dataset_id;
            const collectionId = row.collection_id;

            const count = await MongoDatasetCollection.countDocuments({
              datasetId,
              userId,
              ['metadata.pgCollectionId']: collectionId
            });
            if (count > 0) {
              successCollection += 1;
              console.log('collection already exist', successCollection);
              return;
            }

            if (collectionId === 'manual') {
              await MongoDatasetCollection.create({
                parentId: null,
                datasetId,
                userId,
                name: '手动录入',
                type: DatasetCollectionTypeEnum.virtual,
                updateTime: new Date('2099'),
                metadata: {
                  pgCollectionId: collectionId
                }
              });
            } else if (collectionId === 'mark') {
              await MongoDatasetCollection.create({
                parentId: null,
                datasetId,
                userId,
                name: '手动标注',
                type: DatasetCollectionTypeEnum.virtual,
                updateTime: new Date('2099'),
                metadata: {
                  pgCollectionId: collectionId
                }
              });
            } else if (strIsLink(collectionId)) {
              await MongoDatasetCollection.create({
                parentId: null,
                datasetId,
                userId,
                name: collectionId,
                type: DatasetCollectionTypeEnum.link,
                metadata: {
                  rawLink: collectionId,
                  pgCollectionId: collectionId
                }
              });
            } else {
              // find file
              const gridFs = new GridFSStorage('dataset', userId);
              const collection = gridFs.Collection();
              const file = await collection.findOne({
                _id: new Types.ObjectId(collectionId)
              });

              if (file) {
                await MongoDatasetCollection.create({
                  parentId: null,
                  datasetId,
                  userId,
                  name: file.filename,
                  type: DatasetCollectionTypeEnum.file,
                  metadata: {
                    fileId: file._id,
                    pgCollectionId: collectionId
                  }
                });
              } else {
                // no file
                await MongoDatasetCollection.create({
                  parentId: null,
                  datasetId,
                  userId,
                  name: '未知文件',
                  type: DatasetCollectionTypeEnum.virtual,
                  metadata: {
                    pgCollectionId: collectionId
                  }
                });
              }
            }
            successCollection += 1;
            console.log('create collection success', successCollection);
          })
        );
      }
    } catch (error) {
      initCollection();
    }
  }

  // init dataset collection
  console.log(`total collection: ${rowCount}`);
  await initCollection();
}
