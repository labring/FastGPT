import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { delFileById, getGFSCollection } from '@fastgpt/service/common/file/gridfs/controller';
import { addLog } from '@fastgpt/service/common/mongo/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { delay } from '@fastgpt/global/common/system/utils';

/* 
  check dataset.files data. If there is no match in dataset.collections, delete it
*/
let deleteFileAmount = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      startDay = 10,
      endDay = 3,
      limit = 30
    } = req.body as { startDay?: number; endDay?: number; limit?: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    // start: now - maxDay, end: now - 3 day
    const start = new Date(Date.now() - startDay * 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() - endDay * 24 * 60 * 60 * 1000);
    deleteFileAmount = 0;

    checkFiles(start, end, limit);

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    addLog.error(`check valid dataset files error`, error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export async function checkFiles(start: Date, end: Date, limit: number) {
  const collection = getGFSCollection('dataset');
  const where = {
    uploadDate: { $gte: start, $lte: end }
  };

  // 1. get all _id
  const ids = await collection
    .find(where, {
      projection: {
        _id: 1
      }
    })
    .toArray();
  console.log('total files', ids.length);

  for (let i = 0; i < limit; i++) {
    check(i);
  }

  async function check(index: number): Promise<any> {
    const id = ids[index];
    if (!id) {
      console.log(`检测完成，共删除 ${deleteFileAmount} 个无效文件`);

      return;
    }
    try {
      const { _id } = id;

      // 2. find fileId in dataset.collections
      const hasCollection = await MongoDatasetCollection.countDocuments({ fileId: _id });

      // 3. if not found, delete file
      if (hasCollection === 0) {
        await delFileById({ bucketName: 'dataset', fileId: String(_id) });
        console.log('delete file', _id);
        deleteFileAmount++;
      }
      index % 100 === 0 && console.log(index);
      return check(index + limit);
    } catch (error) {
      console.log(error);
      await delay(2000);
      return check(index);
    }
  }
}
