import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addLog } from '@fastgpt/service/common/system/log';
import { addHours } from 'date-fns';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';

/* 
  检测无效的数据集图片

  可能异常情况：
  1. 上传文件过程中，上传了图片，但是最终没有创建数据集。
*/

let deleteImageAmount = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      startHour = 72,
      endHour = 24,
      limit = 10
    } = req.body as { startHour?: number; endHour?: number; limit?: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();

    // start: now - maxDay, end: now - 3 day
    const start = addHours(new Date(), -startHour);
    const end = addHours(new Date(), -endHour);
    deleteImageAmount = 0;

    await checkInvalid(start, end, limit);

    jsonRes(res, {
      data: deleteImageAmount
    });
  } catch (error) {
    addLog.error(`check Invalid user error`, error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export async function checkInvalid(start: Date, end: Date, limit = 50) {
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
