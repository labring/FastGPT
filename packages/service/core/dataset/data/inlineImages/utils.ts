import {
  matchDocumentImages,
  unescapeMarkdownImageUrl
} from '@fastgpt/global/common/string/markdown';
import { getS3TextReferences } from '../../../../common/s3/utils/textReferences';
import { parseChunkImageKey } from '../../../../common/s3/sources/dataset/chunkImageKey';

export type ChunkImageContent = {
  q?: string;
  a?: string;
  imageId?: string;
  indexes?: Array<{ text?: string }>;
};

/** 按预览支持的语法临时提取受管图片，不在 data/task 中持久化第二份引用清单。 */
export const getChunkImageReferences = (data: ChunkImageContent[]) =>
  new Set(
    data
      .flatMap((item) => [
        ...(item.imageId ? [item.imageId] : []),
        ...[
          item.q ?? '',
          item.a ?? '',
          ...(item.indexes?.map(({ text }) => text ?? '') ?? [])
        ].flatMap((text) => [
          ...matchDocumentImages(text).map((image) =>
            image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url
          ),
          ...getS3TextReferences(text).map(({ objectKey, format }) =>
            format === 'markdown' ? unescapeMarkdownImageUrl(objectKey) : objectKey
          ),
          // 预览正则先要求 dataset/ 前缀；普通链接的转义斜线需先还原再识别，HTML 保持字面值。
          ...getS3TextReferences(unescapeMarkdownImageUrl(text))
            .filter(({ format }) => format === 'markdown')
            .map(({ objectKey }) => objectKey)
        ])
      ])
      .filter((key) => parseChunkImageKey(key))
  );
