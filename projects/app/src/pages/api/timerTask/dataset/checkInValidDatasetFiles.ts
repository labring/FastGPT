import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  delFileByFileIdList,
  getGFSCollection
} from '@fastgpt/service/common/file/gridfs/controller';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { addHours } from 'date-fns';

/* 
  check dataset.files data. If there is no match in dataset.collections, delete it
  可能异常情况
  1. 上传了文件，未成功创建集合
*/
let deleteFileAmount = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { startHour = 24, endHour = 1 } = req.body as {
      startHour?: number;
      endHour?: number;
      limit?: number;
    };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    // start: now - maxDay, end: now - 3 day
    const start = addHours(new Date(), -startHour);
    const end = addHours(new Date(), -endHour);
    deleteFileAmount = 0;
    console.log(start, end);

    await checkFiles(start, end);

    jsonRes(res, {
      data: deleteFileAmount,
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

export async function checkFiles(start: Date, end: Date) {
  const collection = getGFSCollection('dataset');
  const where = {
    uploadDate: { $gte: start, $lte: end }
  };

  // 1. get all file _id
  const files = await collection
    .find(where, {
      projection: {
        metadata: 1,
        _id: 1
      }
    })
    .toArray();
  console.log('total files', files.length);

  let index = 0;
  for await (const file of files) {
    try {
      // 2. find fileId in dataset.collections
      const hasCollection = await MongoDatasetCollection.countDocuments({
        teamId: file.metadata.teamId,
        fileId: file._id
      });

      // 3. if not found, delete file
      if (hasCollection === 0) {
        await delFileByFileIdList({ bucketName: 'dataset', fileIdList: [String(file._id)] });
        console.log('delete file', file._id);
        deleteFileAmount++;
      }
      index++;
      index % 100 === 0 && console.log(index);
    } catch (error) {
      console.log(error);
    }
  }
  console.log(`检测完成，共删除 ${deleteFileAmount} 个无效文件`);
}
