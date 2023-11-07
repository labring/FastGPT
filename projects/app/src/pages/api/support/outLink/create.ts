import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { customAlphabet } from 'nanoid';
import { OutLinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

/* create a shareChat */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, ...props } = req.body as OutLinkEditType & {
      appId: string;
      type: `${OutLinkTypeEnum}`;
    };

    const { teamId, tmbId } = await authApp({ req, authToken: true, appId, per: 'w' });

    const shareId = nanoid();
    await MongoOutLink.create({
      shareId,
      teamId,
      tmbId,
      appId,
      ...props
    });

    jsonRes(res, {
      data: shareId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
