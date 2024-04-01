import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { checkFiles } from '../timerTask/dataset/checkInValidDatasetFiles';
import { addHours } from 'date-fns';
import { checkInvalidCollection } from '../timerTask/dataset/checkInvalidMongoCollection';
import { checkInvalidVector } from '../timerTask/dataset/checkInvalidVector';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

let deleteImageAmount = 0;
export async function checkInvalidImg(start: Date, end: Date, limit = 50) {
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

    // 检查 usage 是否有记录
    const totalUsages = await MongoUsage.countDocuments();
    if (totalUsages === 0) {
      // 重命名 bills 集合成 usages
      await connectionMongo.connection.db.renameCollection('bills', 'usages', {
        // 强制
        dropTarget: true
      });
    }

    (async () => {
      try {
        console.log('执行脏数据清理任务');
        const end = addHours(new Date(), -1);
        const start = addHours(new Date(), -360 * 24);
        await checkFiles(start, end);
        await checkInvalidImg(start, end);
        await checkInvalidCollection(start, end);
        await checkInvalidVector(start, end);
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
