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

    console.log('rename');
    await rename();

    console.log('init mongo data');
    await initMongo(limit);

    console.log('create collection');
    await createCollection(limit);

    console.log('update pg collectionId');
    await updatePgCollection(limit);
    console.log('init done');

    jsonRes(res, {
      data: {}
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function rename() {
  // rename mongo kbs -> datasets
  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'kbs' })
      .toArray();
    if (collections.length > 0) {
      const kbCollection = connectionMongo.connection.db.collection('kbs');
      await kbCollection.rename('datasets', { dropTarget: true });
      console.log('success rename kbs -> datasets');
    }
  } catch (error) {
    console.log('error： rename kbs -> datasets', error);
  }

  // rename pg: kb_id -> dataset_id
  try {
    const { rows } = await PgClient.query(`SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = '${PgDatasetTableName}'
      AND column_name = 'kb_id'
  );`);

    if (rows[0].exists) {
      await PgClient.query(`ALTER TABLE ${PgDatasetTableName} RENAME COLUMN kb_id TO dataset_id`);
      console.log('success rename kb_id -> dataset_id');
    }
  } catch (error) {
    console.log('error： rename kb_id -> dataset_id', error);
  }
  // rename pg: file_id -> collection_id
  try {
    const { rows } = await PgClient.query(`SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = '${PgDatasetTableName}'
      AND column_name = 'file_id'
  );`);

    if (rows[0].exists) {
      await PgClient.query(
        `ALTER TABLE ${PgDatasetTableName} RENAME COLUMN file_id TO collection_id`
      );
      console.log('success rename file_id -> collection_id');
    }
  } catch (error) {
    console.log('error： rename file_id -> collection_id', error);
  }
}

async function initMongo(limit: number) {
  async function initApp(limit = 100): Promise<any> {
    // 遍历所有 app，更新 app modules 里的 FlowModuleTypeEnum.kbSearchNode

    const apps = await App.find({ inited: false }).limit(limit);

    if (apps.length === 0) return;

    try {
      await Promise.all(
        apps.map(async (app) => {
          const modules = app.toObject().modules;
          // @ts-ignore
          app.inited = true;

          modules.forEach((module) => {
            // @ts-ignore
            if (module.flowType === 'kbSearchNode') {
              module.flowType = FlowModuleTypeEnum.datasetSearchNode;
              module.inputs.forEach((input) => {
                if (input.key === 'kbList') {
                  input.key = 'datasets';
                  input.value?.forEach((item: any) => {
                    item.datasetId = item.kbId;
                  });
                }
              });
            }
          });

          app.modules = JSON.parse(JSON.stringify(modules));
          await app.save();
        })
      );
      successApp += limit;
      console.log('mongo init:', successApp);
      return initApp(limit);
    } catch (error) {
      return initApp(limit);
    }
  }
  async function initFile() {
    // 找对应的文件
    const collection = connectionMongo.connection.db.collection(`dataset.files`);
    await collection.updateMany({ 'metadata.kbId': { $exists: true } }, [
      {
        $set: {
          'metadata.datasetId': '$metadata.kbId'
        }
      }
    ]);
  }

  // init app
  await App.updateMany(
    {},
    {
      $set: {
        inited: false
      }
    }
  );

  // successApp = 0;
  const totalApp = await App.countDocuments();
  console.log(`total app: ${totalApp}`);
  await delay(2000);
  console.log('start init app');
  await initApp(limit * 2);
  console.log('init app success');

  await initFile();
}

async function createCollection(limit: number) {
  // collectionId 的类型：manual, mark, httpLink, fileId
  async function initCollection(limit: number): Promise<any> {
    const { rows, rowCount } = await PgClient.query(`SELECT user_id,dataset_id,collection_id
  FROM ${PgDatasetTableName} 
  where inited = 0
  GROUP BY user_id,collection_id, dataset_id
  ORDER BY dataset_id 
  LIMIT ${limit};`);

    if (rowCount === 0) {
      console.log('pg done');
      return;
    }

    try {
      await Promise.all(
        rows.map(async (row) => {
          const userId = row.user_id;
          const datasetId = row.dataset_id;
          const collectionId = row.collection_id;

          const count = await MongoDatasetCollection.countDocuments({
            datasetId,
            userId,
            ['metadata.pgCollectionId']: collectionId
          });
          if (count > 0) {
            await PgClient.query(
              `update ${PgDatasetTableName} set inited = 1 where user_id = '${userId}' AND dataset_id='${datasetId}' AND collection_id='${collectionId}'`
            );
            console.log('collection already exist');

            return;
          }

          if (collectionId === 'manual') {
            await MongoDatasetCollection.create({
              parentId: null,
              datasetId,
              userId,
              name: '手动录入',
              type: DatasetCollectionTypeEnum.virtual,
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

          // update data init
          await PgClient.query(
            `update ${PgDatasetTableName} set inited = 1 where user_id = '${userId}' AND dataset_id='${datasetId}' AND collection_id='${collectionId}'`
          );
          successCollection += 1;
          console.log('create collection success', successCollection);
        })
      );

      return initCollection(limit);
    } catch (error) {
      console.log(error);

      return initCollection(limit);
    }
  }
  // 创建 init 列
  await PgClient.query(
    `ALTER TABLE ${PgDatasetTableName} ADD COLUMN IF NOT EXISTS inited integer DEFAULT 0`
  );

  // init dataset collection
  successCollection = 0;
  const { rows } = await PgClient.query(
    `SELECT COUNT(*) 
    FROM (
      SELECT DISTINCT dataset_id, collection_id 
      FROM ${PgDatasetTableName}
      where inited = 0
    ) AS distinct_pairs;
    `
  );
  const count = +rows[0].count;
  console.log(`total collection: ${count}`);
  await initCollection(limit * 2);
}

async function updatePgCollection(limit: number): Promise<any> {
  try {
    const collections = await MongoDatasetCollection.find({
      'metadata.pgCollectionId': { $exists: true, $ne: '' }
    })
      .limit(limit)
      .lean();
    if (collections.length === 0) {
      return;
    }

    await Promise.all(
      collections.map(async (item) => {
        if (item.metadata.pgCollectionId) {
          const where = `dataset_id = '${String(item.datasetId)}' AND user_id='${String(
            item.userId
          )}' AND collection_id = '${String(item.metadata.pgCollectionId)}'`;

          const { rows, rowCount } = await PgClient.query<{ id: number }>(
            `select id from ${PgDatasetTableName} WHERE ${where}`
          );

          if (rowCount < 10000) {
            console.log('update collection', item.metadata.pgCollectionId);
            await PgClient.query(
              `update ${PgDatasetTableName} set collection_id = '${item._id}' where ${where}`
            );
          } else {
            // 分段更新
            const arr: number[][] = [];
            for (let i = 0; i < rowCount; i += 3000) {
              arr.push(rows.slice(i, i + 3000).map((item) => item.id));
            }
            console.log('分段更新', arr.length);
            let success = 0;
            for await (const idList of arr) {
              await PgClient.query(
                `update modeldata set collection_id = '${
                  item._id
                }' where ${where} AND id in (${idList.join(',')})`
              );
              console.log(++success);
            }
          }
        }

        await MongoDatasetCollection.findByIdAndUpdate(item._id, {
          $unset: { 'metadata.pgCollectionId': '' }
        });
      })
    );
    return updatePgCollection(limit);
  } catch (error) {
    return updatePgCollection(limit);
  }
}
