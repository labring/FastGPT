import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { addHours } from 'date-fns';
import {
  checkInvalidDatasetFiles,
  checkInvalidDatasetData,
  checkInvalidVector
} from '@/service/common/system/cronTask';
import dayjs from 'dayjs';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { NextAPI } from '@/service/middleware/entry';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

let deleteImageAmount = 0;
async function checkInvalidImg(start: Date, end: Date) {
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
      ).lean();

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

async function handler(req: NextApiRequest, res: NextApiResponse) {
  deleteImageAmount = 0;
  try {
    await authCert({ req, authRoot: true });
    const { start = -2, end = -360 * 24 } = req.body as { start: number; end: number };

    (async () => {
      try {
        console.log('执行脏数据清理任务');

        // Split time range into 6-hour chunks to avoid processing too much data at once
        const totalHours = Math.abs(start - end);
        const chunkHours = 6;
        const chunks = Math.ceil(totalHours / chunkHours);

        console.log(
          `Total time range: ${totalHours} hours, split into ${chunks} chunks of ${chunkHours} hours each`
        );

        for (let i = 0; i < chunks; i++) {
          const chunkStart = start - i * chunkHours;
          const chunkEnd = Math.max(start - (i + 1) * chunkHours, end);

          const chunkEndTime = addHours(new Date(), chunkStart);
          const chunkStartTime = addHours(new Date(), chunkEnd);

          console.log(
            `Processing chunk ${i + 1}/${chunks}: ${dayjs(chunkStartTime).format(
              'YYYY-MM-DD HH:mm'
            )} to ${dayjs(chunkEndTime).format('YYYY-MM-DD HH:mm')}`
          );

          await retryFn(() => checkInvalidDatasetFiles(chunkStartTime, chunkEndTime));
          await retryFn(() => checkInvalidImg(chunkStartTime, chunkEndTime));
          await retryFn(() => checkInvalidDatasetData(chunkStartTime, chunkEndTime));
          await retryFn(() => checkInvalidVector(chunkStartTime, chunkEndTime));

          console.log(`Chunk ${i + 1}/${chunks} completed`);
        }

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

export default NextAPI(useIPFrequencyLimit({ id: 'admin-api', seconds: 60, limit: 1 }), handler);
