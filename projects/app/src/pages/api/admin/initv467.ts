import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { MongoImageSchemaType } from '@fastgpt/global/common/file/image/type';
import { delay } from '@fastgpt/global/common/system/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';

let success = 0;
let deleteImg = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { test = false } = req.body as { test: boolean };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;
    deleteImg = 0;

    // 取消 pg tmb_id 和 data_id 的null
    await PgClient.query(`ALTER TABLE ${PgDatasetTableName} ALTER COLUMN tmb_id DROP NOT NULL;`);
    await PgClient.query(`ALTER TABLE ${PgDatasetTableName} ALTER COLUMN data_id DROP NOT NULL;`);

    // 重新绑定 images 和 collections
    const images = await MongoImage.find(
      { 'metadata.fileId': { $exists: true } },
      '_id metadata'
    ).lean();

    // 去除 fileId 相同的数据
    const fileIdMap = new Map<string, MongoImageSchemaType>();
    images.forEach((image) => {
      // @ts-ignore
      const fileId = image.metadata?.fileId;
      if (!fileIdMap.has(fileId) && fileId) {
        fileIdMap.set(fileId, image);
      }
    });
    const images2 = Array.from(fileIdMap.values());

    console.log('total image list', images2.length);

    for await (const image of images2) {
      await initImages(image, test);
    }

    jsonRes(res, {
      data: success,
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
export const initImages = async (image: MongoImageSchemaType, test: boolean): Promise<any> => {
  try {
    //@ts-ignore
    const fileId = image.metadata.fileId as string;
    if (!fileId) return;

    // 找到集合
    const collection = await MongoDatasetCollection.findOne({ fileId }, '_id metadata').lean();

    if (!collection) {
      deleteImg++;
      console.log('deleteImg', deleteImg);

      if (test) return;
      return MongoImage.deleteOne({ _id: image._id });
    }

    const relatedImageId = getNanoid(24);

    // update image
    if (!test) {
      await Promise.all([
        MongoImage.updateMany(
          { 'metadata.fileId': fileId },
          { $set: { 'metadata.relatedId': relatedImageId } }
        ),
        MongoDatasetCollection.findByIdAndUpdate(collection._id, {
          $set: {
            'metadata.relatedImgId': relatedImageId
          }
        })
      ]);
    }

    success++;
    console.log('success', success);
  } catch (error) {
    console.log(error);

    await delay(1000);
    return initImages(image, test);
  }
};
