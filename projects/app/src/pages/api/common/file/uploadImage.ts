import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';
import { UploadImgProps } from '@fastgpt/global/common/file/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

/* 
  Upload avatar image
*/
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const body = req.body as UploadImgProps;

    const { teamId } = await authCert({ req, authToken: true });

    const imgId = await uploadMongoImg({
      teamId,
      ...body
    });

    jsonRes(res, { data: imgId });
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
