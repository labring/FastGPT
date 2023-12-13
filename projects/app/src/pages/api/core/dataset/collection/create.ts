/* 
    Create one dataset collection
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api.d';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const body = req.body as CreateDatasetCollectionParams;

    // auth. not visitor and dataset is public
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });
    await authDataset({
      req,
      authToken: true,
      datasetId: body.datasetId,
      per: 'r'
    });

    jsonRes(res, {
      data: await createOneCollection({
        ...body,
        teamId,
        tmbId
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
