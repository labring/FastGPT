import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';
import { UploadImgProps } from '@fastgpt/global/common/file/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';

/* 
  Upload avatar image
*/
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<string> {
  const body = req.body as UploadImgProps;

  const { teamId } = await authCert({ req, authToken: true });

  return uploadMongoImg({
    teamId,
    ...body
  });
}
export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb'
    }
  }
};
