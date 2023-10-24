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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();

    console.log('rename');
    await rename();

    console.log('init mongo data');
    await initMongo(limit);

    console.log('create collection');
    await createCollection();

    console.log('update pg collectionId');
    await updatePgCollection();
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
  let success = 0;

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
      success += limit;
      console.log('mongo init:', success);
      return initApp(limit);
    } catch (error) {
      return initApp(limit);
    }
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

  const totalApp = await App.countDocuments();
  console.log(`total app: ${totalApp}`);
  await delay(2000);
  console.log('start init app');
  await initApp(limit);
  console.log('init mongo success');
}

type RowType = { user_id: string; dataset_id: string; collection_id: string };
async function createCollection() {
  let success = 0;

  const { rows, rowCount } = await PgClient.query(`SELECT user_id,dataset_id,collection_id
  FROM ${PgDatasetTableName} 
  GROUP BY user_id,collection_id, dataset_id
  ORDER BY dataset_id`);

  if (rowCount === 0) {
    console.log('pg done');
    return;
  }
  // init dataset collection
  console.log(`total collection: ${rowCount}`);

  // collectionId 的类型：manual, mark, httpLink, fileId
  async function initCollection(row: RowType): Promise<any> {
    try {
      {
        const userId = row.user_id;
        const datasetId = row.dataset_id;
        const collectionId = row.collection_id;

        const count = await MongoDatasetCollection.countDocuments({
          datasetId,
          userId,
          ['metadata.pgCollectionId']: collectionId
        });
        if (count > 0) {
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
        console.log('create collection success');
      }
    } catch (error) {
      console.log(error);

      await delay(2000);
      return initCollection(row);
    }
  }

  for await (const row of rows) {
    await initCollection(row);
    console.log('init collection success: ', ++success);
  }
}

async function updatePgCollection(): Promise<any> {
  let success = 0;
  const limit = 10;
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
