import {
  matchDocumentImages,
  parseBase64ImageDataUrl,
  unescapeMarkdownImageUrl
} from '@fastgpt/global/common/string/markdown';
import { UserError } from '@fastgpt/global/common/error/utils';
import { addHours } from 'date-fns';
import { getOrCreateChunkImagePrefixId } from '../../collection/entity';
import { createChunkImageKey } from '../../../../common/s3/sources/dataset/chunkImageKey';
import { normalizeMimeType, resolveMimeExtension } from '../../../../common/s3/utils/mime';
import { isValidImageContentType } from '../../../../common/file/image/utils';
import { validateUploadFile } from '../../../../common/s3/validation/upload';
import { MongoS3TTL } from '../../../../common/s3/models/ttl';
import { S3Buckets } from '../../../../common/s3/config/constants';
import { uploadImage2S3Bucket } from '../../../../common/s3/utils';

/**
 * 将直接写入的 Base64 图片转存为本集合对象，只替换地址，保留分块与正文。
 * 在可重试事务之外上传并先登记 TTL；调用方把返回的新 key 交给实际写入事务提升。
 */
export const normalizeDatasetDataImages = async <T extends { q?: string; a?: string }>({
  teamId,
  datasetId,
  collectionId,
  data
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  data: T[];
}): Promise<{ data: T[]; imageUploadKeys: string[] }> => {
  const uploaded = new Map<string, string>();
  let chunkImagePrefixId: string | undefined;
  const normalizeText = async (text: string) => {
    let result = '';
    let lastIndex = 0;
    for (const image of matchDocumentImages(text)) {
      const url = image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url;
      if (!/^data:image\//i.test(url)) continue;
      const parsed = parseBase64ImageDataUrl(url);
      if (!parsed) throw new UserError('Invalid inline base64 image');
      const mime = normalizeMimeType(parsed.mime);
      const buffer = Buffer.from(parsed.base64, 'base64');
      const canonicalBase64 = buffer.toString('base64');
      if (
        !isValidImageContentType(mime) ||
        buffer.length === 0 ||
        (parsed.base64 !== canonicalBase64 && parsed.base64 !== canonicalBase64.replace(/=+$/, ''))
      )
        throw new UserError('Invalid inline base64 image');
      let key = uploaded.get(url);
      if (!key) {
        const extension = resolveMimeExtension(mime);
        const file = await validateUploadFile({
          buffer,
          fileHint: { filename: `image${extension}`, contentType: mime },
          uploadConstraints: { allowedExtensions: [extension] }
        });
        chunkImagePrefixId ??= await getOrCreateChunkImagePrefixId({
          teamId,
          datasetId,
          collectionId
        });
        key = createChunkImageKey({ datasetId, chunkImagePrefixId, filename: file.filename });
        // 存储端写入后抛错也必须有清理依据，不使用上传完成后才登记 TTL 的旧分支。
        await MongoS3TTL.create({
          bucketName: S3Buckets.private,
          minioKey: key,
          expiredTime: addHours(new Date(), 3),
          cleanupType: 'collectionImageUpload'
        });
        await uploadImage2S3Bucket('private', {
          buffer,
          uploadKey: key,
          filename: file.filename,
          mimetype: file.contentType,
          // 截止时间远短于临时清理窗口，必须终止传输，不能只 race 一个拒绝 Promise。
          uploadTimeoutMs: 120_000
        });
        uploaded.set(url, key);
      }
      result += text.slice(lastIndex, image.index) + image.replace(key);
      lastIndex = image.index + image.fullMatch.length;
    }
    return result + text.slice(lastIndex);
  };
  const normalized: T[] = [];
  for (const item of data)
    normalized.push({
      ...item,
      ...(item.q !== undefined && { q: await normalizeText(item.q) }),
      ...(item.a !== undefined && { a: await normalizeText(item.a) })
    });
  return { data: normalized, imageUploadKeys: [...uploaded.values()] };
};
