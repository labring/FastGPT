import { S3Sources } from '../contracts/type';
import {
  htmlImgTokenPrefixPattern,
  htmlImgTokenValuePattern,
  htmlImgTokenSuffixPattern
} from '@fastgpt/global/common/string/markdown';

const s3SourcePattern = Object.values(S3Sources)
  .map((prefix) => `${prefix}\\/`)
  .join('|');

/** 预览和写入校验共用对象引用语法，捕获组保持原预览替换约定。 */
export const s3TextKeyRegex = new RegExp(
  String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(?:<((?:${s3SourcePattern})[^)]+)>|((?:${s3SourcePattern})[^\s)]+))(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|` +
    htmlImgTokenPrefixPattern +
    htmlImgTokenValuePattern +
    htmlImgTokenSuffixPattern,
  'gi'
);

/** 只提取原始对象引用；是否反转义、签名和访问存储由消费方决定。 */
export const getS3TextReferences = (text: string) =>
  [...text.matchAll(s3TextKeyRegex)].flatMap((match) => {
    const markdownKey = match[3] ?? match[4];
    const objectKey = markdownKey ?? (match[7] ?? match[8] ?? match[9])?.trim();
    return objectKey
      ? [
          {
            objectKey,
            format: markdownKey !== undefined ? ('markdown' as const) : ('html' as const)
          }
        ]
      : [];
  });
