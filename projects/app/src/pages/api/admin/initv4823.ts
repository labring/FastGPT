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

      console.log('total collections', collections.length);

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

const checkInvalidDataText = async () => {
  const batchSize = 1000;

  let skip = 0;
  let success = 0;
  while (true) {
    try {
      const dataTexts = await MongoDatasetDataText.find({}, '_id dataId')
        .limit(batchSize)
        .skip(skip)
        .lean();
      if (dataTexts.length === 0) break;

      // 合并相同的 dataId
      const dataIdSet = new Set(dataTexts.map((item) => String(item.dataId)));
      for await (const dataId of dataIdSet) {
        try {
          await retryFn(async () => {
            const data = await MongoDatasetData.findById(dataId, '_id').lean();
            if (!data) {
              await MongoDatasetDataText.deleteMany({ dataId });
              console.log('清理无效的data_text', dataId);
            }
          });
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
