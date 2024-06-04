import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { _id, name, responseDetail, limit } = req.body as OutLinkEditType & {};

    if (!_id) {
      throw new Error('_id is required');
    }

    await authOutLinkCrud({ req, outLinkId: _id, authToken: true, per: ManagePermissionVal });

    await MongoOutLink.findByIdAndUpdate(_id, {
      name,
      responseDetail,
      limit
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
