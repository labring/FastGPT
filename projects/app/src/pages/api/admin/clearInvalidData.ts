import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addHours } from 'date-fns';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  checkInvalidDatasetFiles,
  checkInvalidDatasetData,
  checkInvalidVector
} from '@/service/common/system/cronTask';

let deleteImageAmount = 0;
async function checkInvalidImg(start: Date, end: Date, limit = 50) {
  const images = await MongoImage.find(
    {
      createTime: {
        $gte: start,
        $lte: end
      },
      'metadata.relatedId': { $exists: true }
    },
    '_id teamId metadata'
  );
  console.log('total images', images.length);
  let index = 0;

  for await (const image of images) {
    try {
      // 1. 检测是否有对应的集合
      const collection = await MongoDatasetCollection.findOne(
        {
          teamId: image.teamId,
          'metadata.relatedImgId': image.metadata?.relatedId
        },
        '_id'
      );

      if (!collection) {
        await image.deleteOne();
        deleteImageAmount++;
      }

      index++;

      index % 100 === 0 && console.log(index);
    } catch (error) {
      console.log(error);
    }
  }

  console.log(`检测完成，共删除 ${deleteImageAmount} 个无效图片`);
}

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });
    const { start = -2, end = -360 * 24 } = req.body as { start: number; end: number };

    (async () => {
      try {
        console.log('执行脏数据清理任务');
        // 360天 ~ 2小时前
        const endTime = addHours(new Date(), start);
        const startTime = addHours(new Date(), end);
        await checkInvalidDatasetFiles(startTime, endTime);
        await checkInvalidImg(startTime, endTime);
        await checkInvalidDatasetData(startTime, endTime);
        await checkInvalidVector(startTime, endTime);
        console.log('执行脏数据清理任务完毕');
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
