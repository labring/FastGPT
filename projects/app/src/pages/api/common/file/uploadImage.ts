import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';

type Props = { base64Img: string; expiredTime?: Date };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { teamId } = await authCert({ req, authToken: true });
    const { base64Img, expiredTime } = req.body as Props;

    const data = await uploadMongoImg({
      teamId,
      base64Img,
      expiredTime
    });

    jsonRes(res, { data });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
