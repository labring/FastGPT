import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';
import { addLog } from '@fastgpt/service/common/system/log';
import { delay } from '@fastgpt/global/common/system/utils';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetDataTextSchemaType } from '@fastgpt/global/core/dataset/type';
import type { AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';

const updateData = async () => {
  let success = 0;

  while (true) {
    try {
      const time = Date.now();
      const data = await MongoDatasetData.find({
        initJieba: { $exists: false },
        updateTime: { $lte: time } // 只需要取旧的数据
      })
        .limit(1000)
        .lean();
      if (data.length === 0) {
        console.log('更新分词完成');
        break;
      }

      const dataTextOps: AnyBulkWriteOperation<DatasetDataTextSchemaType>[] = [];
      const datasetDataIds: string[] = [];

      // 先进行分词处理
      for await (const item of data) {
        const text = `${item.q} ${item.a}`.trim();
        try {
          const tokens = await jiebaSplit({ text });
          dataTextOps.push({
            updateOne: {
              filter: { dataId: item._id },
              update: { $set: { fullTextToken: tokens } }
            }
          });
          datasetDataIds.push(item._id);
        } catch (error) {
          console.log(`分词处理错误: ${item._id}`, error);
        }
      }

      await mongoSessionRun(async (session) => {
        if (dataTextOps.length > 0) {
          await MongoDatasetDataText.bulkWrite(dataTextOps, { session, ordered: true });
        }
        if (datasetDataIds.length > 0) {
          await MongoDatasetData.updateMany(
            { _id: { $in: datasetDataIds } },
            { $set: { initJieba: true } },
            {
              session
            }
          );
        }
      });

      success += dataTextOps.length;
      console.log(`成功 ${success}`);
    } catch (error) {
      addLog.error('更新所有旧的 jieba 分词失败', error);
      await delay(1000);
    }
  }
};

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  console.log('更新所有旧的 jieba 分词');
  updateData();
  return { success: true };
}

export default NextAPI(handler);
