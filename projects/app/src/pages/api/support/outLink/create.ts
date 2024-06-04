import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import { customAlphabet } from 'nanoid';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

/* create a shareChat */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, ...props } = req.body as OutLinkEditType &
      OutLinkEditType & {
        appId: string;
        type: PublishChannelEnum;
      };

    const { teamId, tmbId } = await authApp({
      req,
      authToken: true,
      appId,
      per: WritePermissionVal
    });

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
