import {
  matchDocumentImages,
  unescapeMarkdownImageUrl
} from '@fastgpt/global/common/string/markdown';
import { UserError } from '@fastgpt/global/common/error/utils';
import { addHours } from 'date-fns';
import { MongoS3TTL } from '../../../../common/s3/models/ttl';
import { S3Buckets } from '../../../../common/s3/config/constants';
import { createOpaqueS3FileKey } from '../../../../common/s3/opaqueKey';
import { uploadImage2S3Bucket } from '../../../../common/s3/utils';
import { normalizeMimeType, resolveMimeExtension } from '../../../../common/s3/utils/mime';
import { isValidImageContentType } from '../../../../common/file/image/utils';
import {
  detectUploadFileEvidence,
  resolveUploadFile
} from '../../../../common/s3/uploadPolicy/service';

/**
 * 将已鉴权 API 分块中的内嵌图片转存到所属知识库；只替换图片地址，保留正文和分块边界。
 * 每个请求内复用相同 data URL。上传在训练事务外执行，先登记持久归属与引用检查记录，
 * 后续定时检查最后引用并回收；上传错误向调用方传播，不能静默删除用户图片。
 */
export const normalizeDatasetDataImages = async <T extends { q?: string; a?: string }>({
  teamId,
  datasetId,
  data
}: {
  teamId: string;
  datasetId: string;
  data: T[];
}): Promise<T[]> => {
  const uploadedImages = new Map<string, string>();

  const normalizeText = async (text: string) => {
    let result = '';
    let lastIndex = 0;

    for (const image of matchDocumentImages(text)) {
      const url = image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url;
      if (!/^data:image\//i.test(url)) continue;

      const match = /^data:(image\/[^;,]+);base64,([a-z0-9+/]+={0,2})$/i.exec(url);
      if (!match) throw new UserError('Invalid inline base64 image');
      const [, declaredMime, base64] = match;
      const mime = normalizeMimeType(declaredMime);
      const buffer = Buffer.from(base64, 'base64');
      if (
        !isValidImageContentType(mime) ||
        buffer.length === 0 ||
        buffer.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')
      ) {
        throw new UserError('Invalid inline base64 image');
      }

      let key = uploadedImages.get(url);
      if (!key) {
        const extension = resolveMimeExtension(mime);
        const evidence = await detectUploadFileEvidence({ buffer });
        const file = resolveUploadFile({
          hint: { filename: `image${extension}`, contentType: mime },
          policy: { defaultContentType: mime, allowedExtensions: [extension] },
          evidence
        });
        const { objectKey } = createOpaqueS3FileKey({
          prefix: ['dataset', datasetId, 'inline-images'],
          filename: file.filename
        });

        // 先登记再上传：即使存储端已写入但客户端收到错误，也有到期清理依据。
        await MongoS3TTL.create({
          minioKey: objectKey,
          bucketName: S3Buckets.private,
          expiredTime: addHours(new Date(), 3),
          datasetInlineImage: { teamId, datasetId }
        });
        key = await uploadImage2S3Bucket('private', {
          uploadKey: objectKey,
          filename: file.filename,
          mimetype: file.contentType,
          buffer
        });
        uploadedImages.set(url, key);
      }

      result += text.slice(lastIndex, image.index) + image.replace(key);
      lastIndex = image.index + image.fullMatch.length;
    }

    return result + text.slice(lastIndex);
  };

  const normalizedData: T[] = [];
  for (const item of data) {
    normalizedData.push({
      ...item,
      ...(item.q !== undefined && { q: await normalizeText(item.q) }),
      ...(item.a !== undefined && { a: await normalizeText(item.a) })
    });
  }
  return normalizedData;
};
