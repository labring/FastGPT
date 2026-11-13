import { PaginationPageNumSchema, PaginationPageSizeSchema } from '@fastgpt/global/openapi/api';
import { CliArgumentError } from './errors';

/**
 * 将命令行传入的 parentId 规范化；支持 "null"、""、"root"、"/" 显式转为 null（表示根目录）。
 */
export function parseParentIdOption(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === 'null' || trimmed === '' || trimmed === 'root' || trimmed === '/') {
      return null;
    }
    return trimmed;
  }
  return null;
}

/**
 * 解析逗号分隔或重复传入的 ID 列表。
 */
export function parseIdListOption(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    const ids = raw
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : undefined;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const ids = parsed.map((item) => String(item).trim()).filter(Boolean);
          return ids.length > 0 ? ids : undefined;
        }
      } catch {
        // 按逗号分隔兜底
      }
    }
    const ids = trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : undefined;
  }
  return undefined;
}

/**
 * 统一解析大文本输入：支持直接传入文本、`--file <path>`（支持 `-` 表示 stdin）或 `--stdin`。
 */
export async function resolveTextInput({
  directText,
  filePath,
  useStdin,
  readTextFile,
  readStdin,
  fieldLabel = 'text'
}: {
  directText?: string;
  filePath?: string;
  useStdin?: boolean;
  readTextFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
  fieldLabel?: string;
}): Promise<string | undefined> {
  if (directText !== undefined) {
    return directText;
  }
  if (filePath !== undefined) {
    if (filePath === '-') {
      return readStdin();
    }
    return readTextFile(filePath);
  }
  if (useStdin) {
    const content = await readStdin();
    if (!content.trim()) {
      throw new CliArgumentError(`Stdin was empty when reading ${fieldLabel}.`);
    }
    return content;
  }
  return undefined;
}

/**
 * 仅在值为字符串时执行 trim；非字符串值原样保留，交由 Zod schema 在字段校验阶段报错，防止触发 TypeError。
 */
export function trimIfString<T>(value: T): T {
  return (typeof value === 'string' ? value.trim() : value) as T;
}

/**
 * 运行时类型守卫：判断值是否为普通对象（非 null 且非数组）。
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 统一解析 JSON 载荷输入，返回未收窄的 `unknown` 类型，避免泛型断言绕过运行时类型校验。
 */
export async function resolveJsonPayload({
  inlineJson,
  filePath,
  useStdin,
  readTextFile,
  readStdin,
  fieldLabel = 'JSON payload'
}: {
  inlineJson?: string;
  filePath?: string;
  useStdin?: boolean;
  readTextFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
  fieldLabel?: string;
}): Promise<unknown> {
  const raw = await resolveTextInput({
    directText: inlineJson,
    filePath,
    useStdin,
    readTextFile,
    readStdin,
    fieldLabel
  });
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new CliArgumentError(`${fieldLabel} cannot be empty.`);
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new CliArgumentError(`Invalid JSON in ${fieldLabel}: ${msg}`);
  }
}

/**
 * 解析 JSON 对象载荷输入，确保顶层必须为普通对象（非数组或原始值）。
 */
export async function resolveJsonObjectPayload(params: {
  inlineJson?: string;
  filePath?: string;
  useStdin?: boolean;
  readTextFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
  fieldLabel?: string;
}): Promise<Record<string, unknown> | undefined> {
  const parsed = await resolveJsonPayload(params);
  if (parsed === undefined) {
    return undefined;
  }
  if (!isPlainObject(parsed)) {
    throw new CliArgumentError(`${params.fieldLabel ?? 'JSON payload'} must be a JSON object.`);
  }
  return parsed;
}

const DEFAULT_PAGE_NUM = PaginationPageNumSchema.parse(undefined) ?? 1;
const DEFAULT_PAGE_SIZE = PaginationPageSizeSchema.parse(undefined);

/**
 * 基于经过 Zod 校验与截断后的请求体生成统一的分页元数据（遵循 engineering-standards §4.4）。
 * 若为非分页分支（如按精确 ID 列表查询），返回 `{ total, count, hasMore: false }`。
 */
export function buildPaginationMeta({
  validatedBody,
  total,
  count,
  nonPaginated = false
}: {
  validatedBody: Record<string, unknown>;
  total: number;
  count: number;
  nonPaginated?: boolean;
}): Record<string, unknown> {
  if (nonPaginated) {
    return {
      total,
      count,
      hasMore: false
    };
  }

  const pageSize =
    typeof validatedBody.pageSize === 'number' ? validatedBody.pageSize : DEFAULT_PAGE_SIZE;
  if (typeof validatedBody.offset === 'number') {
    const offset = validatedBody.offset;
    const hasMore = offset + count < total;
    return {
      total,
      offset,
      pageSize,
      hasMore,
      count
    };
  }

  const page = typeof validatedBody.pageNum === 'number' ? validatedBody.pageNum : DEFAULT_PAGE_NUM;
  const hasMore = page * pageSize < total;
  return {
    total,
    page,
    pageSize,
    hasMore,
    count
  };
}
