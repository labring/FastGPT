import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { POST } from '@fastgpt/service/common/api/plusRequest';

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    await MongoAppVersion.updateMany(
      {},
      {
        $set: {
          isPublish: true
        }
      }
    );

    if (FastGPTProUrl) {
      await POST('/admin/init/4810');
    }

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
