import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCertOrShareId } from '@fastgpt/service/support/permission/auth/common';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';
import { UploadImgProps } from '@fastgpt/global/common/file/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { shareId, ...body } = req.body as UploadImgProps;

    const { teamId } = await authCertOrShareId({ req, shareId, authToken: true });

    const data = await uploadMongoImg({
      teamId,
      ...body
    });

    jsonRes(res, { data });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16mb'
    }
  }
};
