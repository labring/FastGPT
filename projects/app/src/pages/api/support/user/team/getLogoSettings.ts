import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { ImageTypeEnum } from '@fastgpt/global/common/file/image/type.d';

export type GetLogoSettingsQuery = {};

export type GetLogoSettingsBody = {};

export type LogoSettings = {
  wideLogoUrl?: string;
  squareLogoUrl?: string;
};

export type GetLogoSettingsResponse = LogoSettings;

async function handler(
  req: ApiRequestProps<GetLogoSettingsBody, GetLogoSettingsQuery>,
  res: ApiResponseType<GetLogoSettingsResponse>
): Promise<GetLogoSettingsResponse> {
  const { teamId } = await authCert({ req, authToken: true });

  // 并行查询宽Logo和方形Logo
  const [wideLogoImage, squareLogoImage] = await Promise.all([
    MongoImage.findOne({
      teamId,
      type: ImageTypeEnum.LOGO_WIDE
    })
      .sort({ createTime: -1 }) // 获取最新的
      .lean(),
    MongoImage.findOne({
      teamId,
      type: ImageTypeEnum.LOGO_SQUARE
    })
      .sort({ createTime: -1 }) // 获取最新的
      .lean()
  ]);

  // 生成图片URL的辅助函数
  const getImageUrl = (image: any) => {
    if (!image) return undefined;

    const mime = image.metadata?.mime || 'image/jpeg';
    let extension = mime.split('/')[1];
    if (extension.startsWith('x-')) {
      extension = extension.substring(2);
    }

    return `${process.env.NEXT_PUBLIC_BASE_URL || ''}${imageBaseUrl}${String(image._id)}.${extension}`;
  };

  return {
    wideLogoUrl: getImageUrl(wideLogoImage),
    squareLogoUrl: getImageUrl(squareLogoImage)
  };
}

export default NextAPI(handler);
