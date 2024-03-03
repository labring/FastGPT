import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authChatCert } from '@/service/support/permission/auth/chat';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';
import { UploadImgProps } from '@fastgpt/global/common/file/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const body = req.body as UploadImgProps;

    const { teamId } = await authChatCert({ req, authToken: true });

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
