import { isHttpUrl } from '@fastgpt/global/common/string/url';

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
