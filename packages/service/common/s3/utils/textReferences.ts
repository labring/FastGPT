import { S3Sources } from '../contracts/type';
import {
  htmlImgTokenPrefixPattern,
  htmlImgTokenValuePattern,
  htmlImgTokenSuffixPattern
} from '@fastgpt/global/common/string/markdown';

const s3SourcePattern = Object.values(S3Sources)
  .map((prefix) => `${prefix}\\/`)
  .join('|');

/**
 * 预览替换与生命周期保护共用的对象引用语法：Markdown 图片、普通链接和 HTML img。
 * 捕获组保持预览替换约定：3/4=Markdown 地址，6=HTML 前缀，7/8/9=src，10=后缀。
 */
export const s3TextKeyRegex = new RegExp(
  String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(?:<((?:${s3SourcePattern})[^)]+)>|((?:${s3SourcePattern})[^\s)]+))(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|` +
    htmlImgTokenPrefixPattern +
    htmlImgTokenValuePattern +
    htmlImgTokenSuffixPattern,
  'gi'
);

/** 只提取原始对象地址及语法形态，不签发链接或访问存储；Markdown 反转义由消费方决定。 */
export const getS3TextReferences = (text?: string) => {
  const references: Array<{ objectKey: string; format: 'markdown' | 'html' }> = [];
  if (!text || typeof text !== 'string') return references;

  for (const match of text.matchAll(s3TextKeyRegex)) {
    const markdownObjectKey = match[3] ?? match[4];
    const htmlObjectKey = match[7] ?? match[8] ?? match[9];
    const objectKey = markdownObjectKey ?? htmlObjectKey?.trim();
    if (objectKey) {
      references.push({
        objectKey,
        format: markdownObjectKey !== undefined ? 'markdown' : 'html'
      });
    }
  }
  return references;
};
