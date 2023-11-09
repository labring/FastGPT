import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { CreateDatasetParams } from '@/global/core/api/datasetReq.d';
import { createDefaultCollection } from './collection/create';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { name, tags, avatar, vectorModel, parentId, type } = req.body as CreateDatasetParams;

    // 凭证校验
    const { teamId, tmbId } = await authUserNotVisitor({ req, authToken: true });

    const { _id } = await MongoDataset.create({
      name,
      teamId,
      tmbId,
      tags,
      vectorModel,
      avatar,
      parentId: parentId || null,
      type
    });

    await createDefaultCollection({
      datasetId: _id,
      teamId,
      tmbId
    });

    jsonRes(res, { data: _id });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
