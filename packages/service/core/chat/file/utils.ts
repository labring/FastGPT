import { isHttpUrl } from '@fastgpt/global/common/string/url';
import path from 'node:path';
import { S3SignedDownloadAliasValueSchema } from '../../../common/s3/accessLink/type';

/** 区分下载短链凭证与真实文件名；只检查格式，不验证签名或授予访问权限。 */
export const isSignedDownloadAlias = (value: string) =>
  S3SignedDownloadAliasValueSchema.safeParse(value).success;

/**
 * 从 URL 路径解码并提取文件名，不读取 filename 查询参数或探测远端元数据。
 * 非法 URL、路径解码失败或没有文件名时返回 undefined，由调用方决定展示名的兜底策略。
 */
export const getFileNameFromUrl = (url: string): string | undefined => {
  try {
    return path.basename(decodeURIComponent(new URL(url).pathname)) || undefined;
  } catch {
    return;
  }
};

/** 只接受显式 HTTP(S) 协议的绝对链接，排除相对路径和不完整的 URL。 */
export const isAbsoluteHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** 外链忽略 fragment，但保留查询参数（包括签名）；非外链保留原始身份。 */
export const getFileUrlIdentity = (url: string): string => {
  if (!isAbsoluteHttpUrl(url)) return url;
  const parsed = new URL(url);
  parsed.hash = '';
  return `external:${parsed.toString()}`;
};

/** 按首次出现的文件身份去重并截断；不校验文件、不请求网络、不登记 Context。 */
export const selectFileInputs = <T>({
  files,
  maxFiles,
  getIdentity
}: {
  files: T[];
  maxFiles: number;
  getIdentity: (file: T) => string;
}): T[] => {
  const limit = Math.max(0, Math.floor(maxFiles));
  const seen = new Set<string>();
  const selected: T[] = [];
  for (const file of files) {
    if (selected.length >= limit) break;
    const identity = getIdentity(file);
    if (seen.has(identity)) continue;
    seen.add(identity);
    selected.push(file);
  }
  return selected;
};
