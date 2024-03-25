import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addLog } from '@fastgpt/service/common/system/log';
import {
  deleteDatasetDataVector,
  getVectorDataByTime
} from '@fastgpt/service/common/vectorStore/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { addHours } from 'date-fns';

/* 
  检测无效的 Vector 数据. 
  异常情况：
  1. 插入数据时，vector成功，mongo失败
  2. 更新数据，也会有插入 vector
*/

let deletedVectorAmount = 0;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { startHour = 5, endHour = 1 } = req.body as { startHour?: number; endHour?: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    // start: now - maxDay, end: now - endHour
    const start = addHours(new Date(), -startHour);
    const end = addHours(new Date(), -endHour);
    deletedVectorAmount = 0;

    await checkInvalidVector(start, end);

    jsonRes(res, {
      data: deletedVectorAmount,
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

export async function checkInvalidVector(start: Date, end: Date) {
  // 1. get all vector data
  const rows = await getVectorDataByTime(start, end);
  console.log('total data', rows.length);

  let index = 0;

  for await (const item of rows) {
    if (!item.teamId || !item.datasetId || !item.id) {
      console.log('error data', item);
      continue;
    }
    try {
      // 2. find dataset.data
      const hasData = await MongoDatasetData.countDocuments({
        teamId: item.teamId,
        datasetId: item.datasetId,
        'indexes.dataId': item.id
      });

      // 3. if not found, delete vector
      if (hasData === 0) {
        await deleteDatasetDataVector({
          teamId: item.teamId,
          id: item.id
        });
        console.log('delete vector data', item.id);
        deletedVectorAmount++;
      }

      index++;
      index % 100 === 0 && console.log(index);
    } catch (error) {
      console.log(error);
    }
  }

  console.log(`检测完成，共删除 ${deletedVectorAmount} 个无效 向量 数据`);
}
