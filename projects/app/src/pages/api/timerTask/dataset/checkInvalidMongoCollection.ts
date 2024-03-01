import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addLog } from '@fastgpt/service/common/system/log';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { addHours } from 'date-fns';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';

/* 
  检测无效的 Mongo 数据
  异常情况：
  1. 训练过程删除知识库，可能导致还会有新的数据插入，导致无效。
*/

let deleteAmount = 0;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { startHour = 3, endHour = 1 } = req.body as { startHour?: number; endHour?: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    // start: now - maxDay, end: now - endHour
    const start = addHours(new Date(), -startHour);
    const end = addHours(new Date(), -endHour);
    deleteAmount = 0;

    await checkInvalidCollection(start, end);

    jsonRes(res, {
      data: deleteAmount,
      message: 'success'
    });
  } catch (error) {
    addLog.error(`check Invalid user error`, error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export async function checkInvalidCollection(start: Date, end: Date) {
  // 1. 获取时间范围的所有data
  const rows = await MongoDatasetData.find(
    {
      updateTime: {
        $gte: start,
        $lte: end
      }
    },
    '_id teamId collectionId'
  ).lean();

  // 2. 合并所有的collectionId
  const map = new Map<string, { teamId: string; collectionId: string }>();
  for (const item of rows) {
    const collectionId = String(item.collectionId);
    if (!map.has(collectionId)) {
      map.set(collectionId, { teamId: item.teamId, collectionId });
    }
  }
  const list = Array.from(map.values());
  console.log('total collections', list.length);
  let index = 0;

  for await (const item of list) {
    try {
      // 3. 查看该collection是否存在，不存在，则删除对应的数据
      const collection = await MongoDatasetCollection.findOne({ _id: item.collectionId });
      if (!collection) {
        const result = await Promise.all([
          MongoDatasetTraining.deleteMany({
            teamId: item.teamId,
            collectionId: item.collectionId
          }),
          MongoDatasetData.deleteMany({
            teamId: item.teamId,
            collectionId: item.collectionId
          }),
          deleteDatasetDataVector({
            teamId: item.teamId,
            collectionIds: [String(item.collectionId)]
          })
        ]);
        console.log(result);
        console.log('collection is not found', item);
        continue;
      }
    } catch (error) {}
    console.log(++index);
  }
}
