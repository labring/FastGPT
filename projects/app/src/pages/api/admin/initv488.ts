import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DataSetDefaultRoleVal } from '@fastgpt/global/support/permission/dataset/constant';

/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authCert({ req, authRoot: true });

    await MongoDataset.updateMany(
      {
        inheritPermission: { $exists: false }
      },
      {
        $set: {
          inheritPermission: true
        }
      }
    );
    await MongoDataset.updateMany(
      {
        defaultPermission: { $exists: false }
      },
      {
        $set: {
          defaultPermission: DataSetDefaultRoleVal
        }
      }
    );

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
