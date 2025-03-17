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
  try {
    const datas = (await MongoDatasetData.aggregate([
      {
        $group: {
          _id: '$collectionId',
          teamId: { $first: '$teamId' },
          datasetId: { $first: '$datasetId' },
          collectionId: { $first: '$collectionId' }
        }
      }
    ])) as {
      _id: string;
      teamId: string;
      datasetId: string;
      collectionId: string;
    }[];
    console.log('Total data collections length', datas.length);
    // 批量获取集合
    const collections = await MongoDatasetCollection.find({}, '_id').lean();
    console.log('Total collection length', collections.length);
    const collectionMap: Record<string, DatasetCollectionSchemaType> = {};
    for await (const collection of collections) {
      collectionMap[collection._id] = collection;
    }
    // 逐一删除无效的集合内容
    for await (const data of datas) {
      try {
        const col = collectionMap[data.collectionId];
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
      } catch (error) {
        console.log(error);
      }
    }

    console.log(`检测集合完成`);
  } catch (error) {
    console.log('checkInvalidData error', error);
  }
};

// 删了data，没删 data_text
const checkInvalidDataText = async () => {
  try {
    // 获取所有索引层的 dataId
    const dataTexts = await MongoDatasetDataText.find({}, 'dataId').lean();
    const dataIds = dataTexts.map((item) => String(item.dataId));
    console.log('Total data_text dataIds:', dataIds.length);

    // 获取数据层的 dataId
    const datas = await MongoDatasetData.find({}, '_id').lean();
    const datasSet = new Set(datas.map((item) => String(item._id)));
    console.log('Total data length:', datas.length);

    // 存在索引层，不存在数据层的 dataId，说明数据已经被删了
    const unExistsSet = dataIds.filter((id) => !datasSet.has(id));
    console.log('Total unExists dataIds:', unExistsSet.length);
    await MongoDatasetDataText.deleteMany({
      dataId: { $in: unExistsSet }
    });
  } catch (error) {
    console.log('checkInvalidDataText error', error);
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
