import {
  matchDocumentImages,
  unescapeMarkdownImageUrl
} from '@fastgpt/global/common/string/markdown';
import { getS3TextReferences } from '../../../../common/s3/utils/textReferences';

export type DatasetImageReferenceContent = {
  q?: string;
  a?: string;
  imageId?: string;
  indexes?: Array<{ text?: string }>;
  history?: Array<{ q?: string; a?: string }>;
};

/**
 * 写入保护与回收共用引用解析，覆盖预览消费者支持的普通链接并保留完整图片扫描能力。
 * 原始正文保持不变，仅对 Markdown 目的地址反转义，HTML 属性保留其字面值。
 */
export const getDatasetImageReferences = (data: DatasetImageReferenceContent) =>
  new Set([
    ...(data.imageId ? [data.imageId] : []),
    ...[
      data.q ?? '',
      data.a ?? '',
      ...(data.indexes?.map(({ text }) => text ?? '') ?? []),
      ...(data.history?.flatMap(({ q, a }) => [q ?? '', a ?? '']) ?? [])
    ].flatMap((text) => [
      ...matchDocumentImages(text).map((image) =>
        image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url
      ),
      ...getS3TextReferences(text).map(({ objectKey, format }) =>
        format === 'markdown' ? unescapeMarkdownImageUrl(objectKey) : objectKey
      )
    ])
  ]);
