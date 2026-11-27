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
 * 统一提取文本中的 S3 对象引用及替换函数，供预览提取与预览替换共用。
 * 图片节点复用 `matchDocumentImages`（支持嵌套/转义方括号 alt 与完整 HTML `<img>` 边界），
 * 普通 Markdown 链接及历史非规范尖括号 key 通过单调游标在 O(N) 内按位置合并。
 */
export const getS3TextReferences = (text: string): S3TextReference[] => {
  if (!text || typeof text !== 'string') return [];

  const imageRefs: S3TextReference[] = [];
  const occupiedSpans: Array<[number, number]> = [];

  for (const item of matchDocumentImages(text)) {
    const start = item.index;
    const end = start + item.fullMatch.length;
    // 所有已识别图片节点（含非 S3 的 HTML <img>）都占位，防止兜底正则误扫标签属性中的假语法。
    occupiedSpans.push([start, end]);

    if (!s3SourcePrefixRegex.test(item.url)) continue;

    imageRefs.push({
      objectKey: item.url,
      format: item.format,
      index: start,
      fullMatch: item.fullMatch,
      replace:
        item.format === 'markdown'
          ? (nextUrl: string) => replaceMarkdownImageForPreview(item, nextUrl)
          : item.replace
    });
  }

  const fallbackRefs: S3TextReference[] = [];
  let spanCursor = 0;

  for (const match of text.matchAll(s3MarkdownFallbackRegex)) {
    const start = match.index;
    const fullMatch = match[0];
    const end = start + fullMatch.length;
    // 两路序列均按起始偏移递增，单调推进游标跳过已结束区间，避免平方级重叠检查。
    while (spanCursor < occupiedSpans.length && occupiedSpans[spanCursor]![1] <= start) {
      spanCursor++;
    }
    if (spanCursor < occupiedSpans.length && occupiedSpans[spanCursor]![0] < end) {
      continue;
    }

    const [, bang, alt, wrappedObjectKey, unwrappedObjectKey, markdownTitle] = match;
    const objectKey = wrappedObjectKey ?? unwrappedObjectKey;
    if (!objectKey) continue;

    fallbackRefs.push({
      objectKey,
      format: 'markdown',
      index: start,
      fullMatch,
      replace: (nextUrl: string) => `${bang}[${alt}](${nextUrl}${markdownTitle ?? ''})`
    });
  }

  if (fallbackRefs.length === 0) return imageRefs;
  if (imageRefs.length === 0) return fallbackRefs;

  const merged: S3TextReference[] = [];
  let imageIndex = 0;
  let fallbackIndex = 0;
  while (imageIndex < imageRefs.length && fallbackIndex < fallbackRefs.length) {
    if (imageRefs[imageIndex]!.index <= fallbackRefs[fallbackIndex]!.index) {
      merged.push(imageRefs[imageIndex++]!);
    } else {
      merged.push(fallbackRefs[fallbackIndex++]!);
    }
  }
  while (imageIndex < imageRefs.length) merged.push(imageRefs[imageIndex++]!);
  while (fallbackIndex < fallbackRefs.length) merged.push(fallbackRefs[fallbackIndex++]!);
  return merged;
};
