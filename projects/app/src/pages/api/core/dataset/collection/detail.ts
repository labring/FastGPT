/* 
    Get one dataset collection detail
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getFileById } from '@fastgpt/service/common/file/gridfs/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id } = req.query as { id: string };

    if (!id) {
      throw new Error('Id is required');
    }

    // 凭证校验
    const { collection, canWrite } = await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId: id,
      per: 'r'
    });

    // get file
    const file = collection?.fileId
      ? await getFileById({ bucketName: BucketNameEnum.dataset, fileId: collection.fileId })
      : undefined;

    jsonRes<DatasetCollectionItemType>(res, {
      data: {
        ...collection,
        canWrite,
        sourceName: collection?.name,
        sourceId: collection?.fileId || collection?.rawLink,
        file
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
