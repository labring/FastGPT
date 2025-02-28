import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addHours } from 'date-fns';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { delay, retryFn } from '@fastgpt/global/common/system/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';

// 删了库，没删集合
const checkInvalidCollection = async () => {
  const batchSize = 1000;

  let skip = 0;
  let success = 0;
  while (true) {
    try {
      const collections = await MongoDatasetCollection.find(
        {},
        '_id teamId datasetId fileId metadata'
      )
        .limit(batchSize)
        .skip(skip)
        .lean();
      if (collections.length === 0) break;

      const datasetMap: Record<string, DatasetCollectionSchemaType[]> = {};

      // 相同 datasetId 的集合放到一起
      for await (const collection of collections) {
        const datasetId = String(collection.datasetId);
        const val = datasetMap[datasetId];
        if (val) {
          val.push(collection);
        } else {
          datasetMap[datasetId] = [collection];
        }
      }

      const datasetIds = Object.keys(datasetMap);
      for await (const datasetId of datasetIds) {
        try {
          const val = datasetMap[datasetId];
          if (!val) {
            continue;
          }

          await retryFn(async () => {
            const datasetExists = await MongoDataset.findById(datasetId, '_id').lean();
            if (!datasetExists) {
              console.log('清理无效的知识库集合, datasetId', datasetId);
              await mongoSessionRun(async (session) => {
                return await delCollection({
                  collections: val,
                  delImg: true,
                  delFile: true,
                  session
                });
              });
            }
          });
        } catch (error) {
          console.log(error);
        }
      }

      success += batchSize;
      skip += batchSize;
      console.log(`检测集合完成：${success}`);
    } catch (error) {
      console.log(error);
      await delay(1000);
    }
  }
};

// 删了集合，没删 data
const checkInvalidData = async () => {
  const batchSize = 500;

  let skip = 0;
  let success = 0;
  while (true) {
    try {
      const datas = (await MongoDatasetData.aggregate([
        {
          $group: {
            _id: '$collectionId',
            teamId: { $first: '$teamId' },
            datasetId: { $first: '$datasetId' },
            collectionId: { $first: '$collectionId' }
          }
        },
        { $skip: skip },
        { $limit: batchSize }
      ])) as {
        _id: string;
        teamId: string;
        datasetId: string;
        collectionId: string;
      }[];

      if (datas.length === 0) break;

      // 批量获取集合
      const collections = await MongoDatasetCollection.find(
        { _id: { $in: datas.map((data) => data.collectionId) } },
        '_id'
      ).lean();
      // 逐一删除无效的集合内容
      for await (const data of datas) {
        try {
          await retryFn(async () => {
            const col = collections.find((item) => String(item._id) === String(data.collectionId));
            if (!col) {
              console.log('清理无效的知识库集合内容, collectionId', data.collectionId);
              await retryFn(async () => {
                await MongoDatasetTraining.deleteMany({
                  teamId: data.teamId,
                  datasetId: data.datasetId,
                  collectionId: data.collectionId
                });
                await MongoDatasetDataText.deleteMany({
                  teamId: data.teamId,
                  datasetId: data.datasetId,
                  collectionId: data.collectionId
                });
                await deleteDatasetDataVector({
                  teamId: data.teamId,
                  datasetIds: [data.datasetId],
                  collectionIds: [data.collectionId]
                });
                await MongoDatasetData.deleteMany({
                  teamId: data.teamId,
                  datasetId: data.datasetId,
                  collectionId: data.collectionId
                });
              });
            }
          });
        } catch (error) {
          console.log(error);
        }
      }

      success += batchSize;
      skip += batchSize;
      console.log(`检测集合完成：${success}`);
    } catch (error) {
      console.log(error);
      await delay(1000);
    }
  }
};

// 删了data，没删 data_text
const checkInvalidDataText = async () => {
  const batchSize = 1000;

  let skip = 0;
  let success = 0;
  while (true) {
    try {
      const dataTexts = (await MongoDatasetDataText.aggregate([
        {
          $group: {
            _id: '$dataId',
            dataId: { $first: '$dataId' }
          }
        },
        { $skip: skip },
        { $limit: batchSize }
      ])) as {
        _id: string;
        dataId: string;
      }[];

      if (dataTexts.length === 0) break;

      const datas = await MongoDatasetData.find(
        { _id: { $in: dataTexts.map((item) => item.dataId) } },
        '_id'
      ).lean();
      // 合并相同的 dataId
      for await (const dataText of dataTexts) {
        try {
          const data = datas.find((item) => String(item._id) === String(dataText.dataId));
          if (!data) {
            await retryFn(async () => {
              await MongoDatasetDataText.deleteMany({ dataId: dataText.dataId });
              console.log('清理无效的data_text', dataText.dataId);
            });
          }
        } catch (error) {}
      }

      success += batchSize;
      skip += batchSize;
      console.log(`检测数据完成：${success}`);
    } catch (error) {
      console.log(error);
      await delay(1000);
    }
  }
};

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });
    const { start = -2, end = -360 * 24 } = req.body as { start: number; end: number };

    (async () => {
      try {
        // 360天 ~ 2小时前
        const endTime = addHours(new Date(), start);
        const startTime = addHours(new Date(), end);
        console.log('清理无效的集合');
        await checkInvalidCollection();
        console.log('清理无效的数据');
        await checkInvalidData();
        console.log('清理无效的data_text');
        await checkInvalidDataText();
      } catch (error) {
        console.log('执行脏数据清理任务出错了');
      }
    })();

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
