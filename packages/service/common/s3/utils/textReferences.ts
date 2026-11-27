import { S3Sources } from '../contracts/type';
import {
  matchDocumentImages,
  type DocumentImageItem
} from '@fastgpt/global/common/string/markdown';

const s3SourcePattern = Object.values(S3Sources)
  .map((prefix) => `${prefix}\\/`)
  .join('|');

const s3SourcePrefixRegex = new RegExp(`^(?:${s3SourcePattern})`, 'i');

/** 仅在 `](` 之后用粘连正则校验 S3 目标地址，避免从 `[` 出发在大量未闭合方括号上触发 O(N^2) 回溯。 */
const s3MarkdownDestinationRegex = new RegExp(
  String.raw`\s*(?!https?:\/\/)(?:<((?:${s3SourcePattern})[^)\r\n]+)>|((?:${s3SourcePattern})[^\s)\r\n]+))(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)`,
  'iy'
);

export type FallbackMarkdownLinkMatch = {
  bang: string;
  alt: string;
  index: number;
  fullMatch: string;
  destMatch: RegExpExecArray;
};

/** 判断位置 `pos` 是否被奇数个反斜杠转义。 */
const isEscapedAt = (text: string, pos: number, minStart: number) => {
  let backslashes = 0;
  let i = pos - 1;
  while (i >= minStart && text.charCodeAt(i) === 92) {
    backslashes++;
    i--;
  }
  return (backslashes & 1) === 1;
};

/**
 * 以 `](` 为锚点线性扫描空隙文本中的普通 Markdown 链接（及历史尖括号写法）。
 * 仅当 `](` 后的目标地址命中粘连正则时才向左查找配对 `[`，并单调推进下界 `minStart`，
 * 保证全篇字符最多向左扫描一次，对 `[[[...](` 等退化输入严格保持 O(N)。
 */
export const forEachFallbackMarkdownLink = (
  gapText: string,
  gapOffset: number,
  destinationRegex: RegExp,
  onMatch: (match: FallbackMarkdownLinkMatch) => void
) => {
  let searchFrom = 0;
  let minStart = 0;

  while (searchFrom < gapText.length) {
    const closeBracket = gapText.indexOf('](', searchFrom);
    if (closeBracket === -1) break;

    if (isEscapedAt(gapText, closeBracket, minStart)) {
      searchFrom = closeBracket + 2;
      continue;
    }

    destinationRegex.lastIndex = closeBracket + 2;
    const destMatch = destinationRegex.exec(gapText);
    if (!destMatch) {
      searchFrom = closeBracket + 2;
      continue;
    }

    let depth = 0;
    let openBracket = -1;
    for (let i = closeBracket - 1; i >= minStart; i--) {
      const code = gapText.charCodeAt(i);
      if (code !== 91 && code !== 93) continue;
      if (isEscapedAt(gapText, i, minStart)) continue;
      if (code === 93) {
        depth++;
      } else if (depth === 0) {
        openBracket = i;
        break;
      } else {
        depth--;
      }
    }

    if (openBracket === -1) {
      minStart = closeBracket + 2;
      searchFrom = closeBracket + 2;
      continue;
    }

    const destEnd = destinationRegex.lastIndex;
    const hasBang = openBracket > minStart && gapText.charCodeAt(openBracket - 1) === 33;
    const matchStart = hasBang ? openBracket - 1 : openBracket;

    onMatch({
      bang: hasBang ? '!' : '',
      alt: gapText.slice(openBracket + 1, closeBracket),
      index: gapOffset + matchStart,
      fullMatch: gapText.slice(matchStart, destEnd),
      destMatch
    });

    minStart = destEnd;
    searchFrom = destEnd;
  }
};

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

      forEachFallbackMarkdownLink(
        gapText,
        gapOffset,
        s3MarkdownDestinationRegex,
        ({ bang, alt, index, fullMatch, destMatch }) => {
          const [, wrappedObjectKey, unwrappedObjectKey, markdownTitle] = destMatch;
          const objectKey = wrappedObjectKey ?? unwrappedObjectKey;
          if (!objectKey) return;

          references.push({
            objectKey,
            format: 'markdown',
            index,
            fullMatch,
            replace: (nextUrl: string) => `${bang}[${alt}](${nextUrl}${markdownTitle ?? ''})`
          });
        }
      );
    }
  });

  return references;
};
