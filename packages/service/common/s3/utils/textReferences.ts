import { S3Sources } from '../contracts/type';
import {
  matchDocumentImages,
  type DocumentImageItem
} from '@fastgpt/global/common/string/markdown';

const s3SourcePattern = Object.values(S3Sources)
  .map((prefix) => `${prefix}\\/`)
  .join('|');

const s3SourcePrefixRegex = new RegExp(`^(?:${s3SourcePattern})`, 'i');

/** 仅兜底普通 Markdown 链接及含未转义 > 的历史尖括号写法；规范图片与 HTML <img> 由共享扫描器提供。 */
const s3MarkdownFallbackRegex = new RegExp(
  String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(?:<((?:${s3SourcePattern})[^)]+)>|((?:${s3SourcePattern})[^\s)]+))(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)`,
  'gi'
);

export type S3TextReference = {
  objectKey: string;
  format: 'markdown' | 'html';
  index: number;
  fullMatch: string;
  replace: (nextUrl: string) => string;
};

/** 替换 Markdown 图片目标地址，并对预览短链去掉原尖括号包装，与既有预览契约保持一致。 */
const replaceMarkdownImageForPreview = (item: DocumentImageItem, nextUrl: string) => {
  // scanMarkdownImages 产出结构恒为 `![${altText}](${ws}${dest}...)`，目标区起点精确位于 altText 之后。
  let cursor = item.altText.length + 4;
  while (cursor < item.fullMatch.length && /[ \t\r\n]/.test(item.fullMatch[cursor]!)) {
    cursor++;
  }
  if (item.fullMatch[cursor] === '<') {
    const wrappedEnd = cursor + item.url.length + 2;
    if (item.fullMatch[wrappedEnd - 1] === '>') {
      return item.fullMatch.slice(0, cursor) + nextUrl + item.fullMatch.slice(wrappedEnd);
    }
  }
  return item.replace(nextUrl);
};

/**
 * 按位置顺序遍历文本中的已识别图片节点与图片之间的纯文本空隙。
 * 补充扫描仅运行在各空隙切片上，避免 HTML 属性或图片描述中未闭合的 `[` 越过图片边界吞掉后续普通链接。
 */
export const forEachDocumentImageAndGap = (
  text: string,
  visitors: {
    onImage?: (image: DocumentImageItem) => void;
    onGap?: (gapText: string, gapOffset: number) => void;
  }
) => {
  if (!text || typeof text !== 'string') return;

  const images = matchDocumentImages(text);
  let cursor = 0;

  for (const image of images) {
    if (image.index > cursor) {
      visitors.onGap?.(text.slice(cursor, image.index), cursor);
    }
    visitors.onImage?.(image);
    cursor = image.index + image.fullMatch.length;
  }

  if (cursor < text.length) {
    visitors.onGap?.(cursor === 0 ? text : text.slice(cursor), cursor);
  }
};

/**
 * 统一提取文本中的 S3 对象引用及替换函数，供预览提取与预览替换共用。
 * 图片节点复用 `matchDocumentImages`（支持嵌套/转义方括号 alt 与完整 HTML `<img>` 边界），
 * 普通 Markdown 链接及历史非规范尖括号 key 仅在图片之间的空隙切片中按顺序补扫（总复杂度 O(N)）。
 */
export const getS3TextReferences = (text: string): S3TextReference[] => {
  if (!text || typeof text !== 'string') return [];

  const references: S3TextReference[] = [];

  forEachDocumentImageAndGap(text, {
    onImage: (item) => {
      if (!s3SourcePrefixRegex.test(item.url)) return;

      references.push({
        objectKey: item.url,
        format: item.format,
        index: item.index,
        fullMatch: item.fullMatch,
        replace:
          item.format === 'markdown'
            ? (nextUrl: string) => replaceMarkdownImageForPreview(item, nextUrl)
            : item.replace
      });
    },
    onGap: (gapText, gapOffset) => {
      if (!gapText.includes('](')) return;

      for (const match of gapText.matchAll(s3MarkdownFallbackRegex)) {
        const [, bang, alt, wrappedObjectKey, unwrappedObjectKey, markdownTitle] = match;
        const objectKey = wrappedObjectKey ?? unwrappedObjectKey;
        if (!objectKey) continue;

        references.push({
          objectKey,
          format: 'markdown',
          index: gapOffset + match.index,
          fullMatch: match[0],
          replace: (nextUrl: string) => `${bang}[${alt}](${nextUrl}${markdownTitle ?? ''})`
        });
      }
    }
  });

  return references;
};
