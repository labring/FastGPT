import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, parentId, name, avatar, tags, permission, agentModel, websiteConfig, status } =
      req.body as DatasetUpdateBody;

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    await authDataset({ req, authToken: true, datasetId: id, per: 'owner' });

    await MongoDataset.findOneAndUpdate(
      {
        _id: id
      },
      {
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(tags && { tags }),
        ...(permission && { permission }),
        ...(agentModel && { agentModel: agentModel.model }),
        ...(websiteConfig && { websiteConfig }),
        ...(status && { status })
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
