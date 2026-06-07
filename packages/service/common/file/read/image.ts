import { uploadImage2S3Bucket } from '../../s3/utils';
import { normalizeMimeType, resolveMimeExtension, resolveMimeType } from '../../s3/utils/mime';

export type ParsedPdfImageUploadParams =
  | {
      type: 'base64';
      mime: string;
      dataUrl: string;
    }
  | {
      type: 'http';
      mime: string;
      buffer: Buffer;
    };

export type ParsedPdfImageKeyOptions = {
  prefix: string;
  expiredTime?: Date;
};

/**
 * 将 PDF 解析过程中得到的图片统一写入文件解析图片目录。
 *
 * base64 图片直接使用 dataUrl 上传；http 图片由上游先下载成 buffer 后上传。返回值保持
 * worker/provider 图片处理回调的统一契约，便于 markdown 中直接替换成对象存储 key。
 */
export const uploadParsedPdfImage = async (
  image: ParsedPdfImageUploadParams,
  imageKeyOptions?: ParsedPdfImageKeyOptions
) => {
  if (!imageKeyOptions?.prefix) return { key: '' };

  const { prefix, expiredTime } = imageKeyOptions;
  const mimetype = normalizeMimeType(image.mime);
  const ext = resolveMimeExtension(mimetype);
  const filename = `${crypto.randomUUID()}${ext}`;
  const commonParams = {
    uploadKey: `${prefix}/${filename}`,
    mimetype: resolveMimeType([filename], mimetype),
    filename,
    expiredTime
  };

  const key = await uploadImage2S3Bucket(
    'private',
    image.type === 'base64'
      ? {
          ...commonParams,
          base64Img: image.dataUrl
        }
      : {
          ...commonParams,
          buffer: image.buffer
        }
  );

  return { key };
};
