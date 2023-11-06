import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';

type Props = { base64Img: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authCert({ req, authToken: true });
    const { base64Img } = req.body as Props;

    const data = await uploadMongoImg({
      userId,
      base64Img
    });

    jsonRes(res, { data });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
