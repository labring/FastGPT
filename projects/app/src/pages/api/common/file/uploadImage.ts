import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadMongoImg } from '@fastgpt/service/common/file/image/controller';
import { type UploadImgProps } from '@fastgpt/global/common/file/api';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { ImageTypeEnum } from '@fastgpt/global/common/file/image/type.d';

/*
  Upload image (including avatar, logo, etc.)
*/
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<string> {
  const body = req.body as UploadImgProps;

  const { teamId } = await authCert({ req, authToken: true });

  // 根据imageType确定是否设置永久存储
  const shouldBeForever =
    body.imageType === ImageTypeEnum.AVATAR ||
    body.imageType === ImageTypeEnum.LOGO_WIDE ||
    body.imageType === ImageTypeEnum.LOGO_SQUARE;

  return uploadMongoImg({
    teamId,
    forever: shouldBeForever,
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
