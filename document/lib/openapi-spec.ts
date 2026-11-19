import * as fs from 'node:fs/promises';
import path from 'node:path';
import { isPreviewDocsSite, type FastGPTDocsLocale } from '@/lib/fastgpt-home-url';

const SPEC_FILE_BY_LOCALE: Record<FastGPTDocsLocale, string> = {
  'zh-CN': 'systemopenapi.zh-CN.json',
  en: 'systemopenapi.en.json'
};

/** Resolve the on-disk path for the generated static System OpenAPI 3.1 JSON artifact. */
async function resolveOpenApiSpecPath(fileName: string): Promise<string> {
  // 1. 优先从当前 Next.js 文档应用目录（document/data/openapi）读取静态契约。
  const localPath = path.resolve(process.cwd(), 'data', 'openapi', fileName);
  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    // 2. 若在仓库根目录执行测试脚本，则回退到 document/data/openapi。
    const repoRelativePath = path.resolve(process.cwd(), 'document', 'data', 'openapi', fileName);
    await fs.access(repoRelativePath);
    return repoRelativePath;
  }
}

/** Read the pre-generated System OpenAPI 3.1 JSON string for the specified documentation locale. */
export async function readOpenApiSpec(lang: FastGPTDocsLocale): Promise<string> {
  const fileName = SPEC_FILE_BY_LOCALE[lang];
  const filePath = await resolveOpenApiSpecPath(fileName);
  return fs.readFile(filePath, 'utf8');
}

/** Build HTTP response headers for `/openapi.json` with open CORS and search-engine noindex protection. */
export function getOpenApiSpecHeaders(lang: FastGPTDocsLocale): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Language': lang,
    'X-Robots-Tag': isPreviewDocsSite() ? 'noindex, nofollow' : 'noindex'
  };
}
