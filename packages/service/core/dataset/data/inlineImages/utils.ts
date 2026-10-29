import {
  matchDocumentImages,
  unescapeMarkdownImageUrl
} from '@fastgpt/global/common/string/markdown';

export type DatasetImageReferenceContent = {
  q?: string;
  a?: string;
  imageId?: string;
  indexes?: Array<{ text?: string }>;
  history?: Array<{ q?: string; a?: string }>;
};

/** 写入保护与回收共用图片地址解析，保留正文原样，仅对 Markdown 目的地址反转义。 */
export const getDatasetImageReferences = (data: DatasetImageReferenceContent) =>
  new Set([
    ...(data.imageId ? [data.imageId] : []),
    ...[
      data.q ?? '',
      data.a ?? '',
      ...(data.indexes?.map(({ text }) => text ?? '') ?? []),
      ...(data.history?.flatMap(({ q, a }) => [q ?? '', a ?? '']) ?? [])
    ].flatMap((text) =>
      matchDocumentImages(text).map((image) =>
        image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url
      )
    )
  ]);
