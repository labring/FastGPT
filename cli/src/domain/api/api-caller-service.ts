import type { FileIoAdapter } from '../../infra/fs/file-io';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import type { Prompter } from '../../infra/ui/prompter';
import { CliArgumentError } from '../../shared/errors';
import { resolveJsonObjectPayload, resolveJsonPayload } from '../../shared/input';
import { redactValue } from '../../shared/redact';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliFormat, CliResult, CliRiskLevel } from '../../shared/types';
import type { OpenapiCacheService } from './openapi-cache-service';

export type ApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const SUPPORTED_HTTP_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'DELETE']);
const DESTRUCTIVE_PATH_TOKENS = new Set<string>([
  'del',
  'delete',
  'remove',
  'clear',
  'cancel',
  'purge',
  'drop',
  'reset'
]);
const BLOCKED_AUTH_HEADERS = new Set<string>(['authorization', 'token', 'cookie', 'rootkey']);
const HEADER_NAME_REG = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type ApiCallInput = {
  method: string;
  path: string;
  queryPairs?: readonly string[];
  queryJson?: string;
  body?: string;
  file?: string;
  stdin?: boolean;
  headerPairs?: readonly string[];
  source?: string;
  validate?: boolean;
  refresh?: boolean;
  raw?: boolean;
  output?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  format?: CliFormat;
};

export type ApiCallerService = {
  execute: (params: {
    client: FastGptHttpClient;
    baseUrl?: string;
    input: ApiCallInput;
  }) => Promise<CliResult>;
};

/**
 * 校验并规范化 HTTP 方法，确保与 FastGptHttpClient 传输层契约一致。
 */
export function normalizeApiHttpMethod(rawMethod: string): ApiHttpMethod {
  const normalized = rawMethod.trim().toUpperCase();
  if (!SUPPORTED_HTTP_METHODS.has(normalized)) {
    throw new CliArgumentError(
      `Unsupported HTTP method "${rawMethod}".`,
      { method: rawMethod },
      'Supported HTTP methods: GET, POST, PUT, DELETE.'
    );
  }
  return normalized as ApiHttpMethod;
}

/**
 * 规范化并严格校验 FastGPT API 相对路径：
 * 1. 拒绝空路径、完整 URL（`://` 或 scheme 前缀）、协议相对前缀 `//`、换行/控制字符/反斜杠；
 * 2. 拒绝 `..` 及编码变形路径穿越，避免发出越界或 SSRF 请求；
 * 3. 拒绝内联 `?` 查询串（引导使用 `--query` / `--query-json`）与 `#` 片段；
 * 4. 补全前导 `/` 并剥离重复 `/api` 前缀。
 */
export function normalizeApiRequestPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new CliArgumentError('API path cannot be empty.');
  }

  if (/[\r\n\0\\]/.test(trimmed)) {
    throw new CliArgumentError('API path contains invalid control or backslash characters.');
  }

  if (trimmed.includes('?')) {
    throw new CliArgumentError(
      'API path must not embed a "?" query string.',
      { path: trimmed },
      'Pass query parameters via --query key=value or --query-json \'{"key":"value"}\'.'
    );
  }

  if (trimmed.includes('#')) {
    throw new CliArgumentError('API path must not contain a "#" fragment.');
  }

  if (trimmed.includes('://') || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    throw new CliArgumentError(
      'API path must be a relative FastGPT endpoint path, not a full URL.',
      { path: trimmed },
      'Pass a relative path such as /core/app/list (base URL is configured separately).'
    );
  }

  if (trimmed.startsWith('//')) {
    throw new CliArgumentError(
      'API path must not start with "//".',
      { path: trimmed },
      'Pass a single-slash relative path such as /core/app/list.'
    );
  }

  const hasTraversal = (() => {
    if (trimmed.includes('..') || /%2e%2e|%2e\.|\.%2e|%252e/i.test(trimmed)) {
      return true;
    }
    let decoded = trimmed;
    for (let pass = 0; pass < 2; pass += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next.includes('..')) {
          return true;
        }
        if (next === decoded) {
          break;
        }
        decoded = next;
      } catch {
        break;
      }
    }
    return false;
  })();

  if (hasTraversal) {
    throw new CliArgumentError('API path must not contain ".." path traversal segments.', {
      path: trimmed
    });
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = (() => {
    if (withLeadingSlash === '/api' || withLeadingSlash === '/api/') {
      return '/';
    }
    if (withLeadingSlash.startsWith('/api/')) {
      return withLeadingSlash.slice(4);
    }
    return withLeadingSlash;
  })();

  if (normalized.startsWith('//')) {
    throw new CliArgumentError('API path must not resolve to "//" prefix.', { path: trimmed });
  }

  return normalized;
}

function tokenizePathSegment(segment: string): string[] {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

/**
 * 动态评估 API 请求风险等级并检测管理员路由告警：
 * - `GET` -> `read`
 * - `DELETE` -> `destructive`
 * - `POST`/`PUT` -> 路径含删除/清理/取消/重置语义时提升为 `destructive`，否则为 `write`
 */
export function classifyApiRisk(
  method: ApiHttpMethod,
  normalizedPath: string
): { risk: CliRiskLevel; isAdmin: boolean; warnings: string[] } {
  const isAdmin =
    normalizedPath === '/admin' ||
    normalizedPath.startsWith('/admin/') ||
    normalizedPath === '/proApi/admin' ||
    normalizedPath.startsWith('/proApi/admin/');

  const warnings = isAdmin ? ['Admin endpoint requested; requires root/admin token.'] : [];

  const risk: CliRiskLevel = (() => {
    if (method === 'GET') {
      return 'read';
    }
    if (method === 'DELETE') {
      return 'destructive';
    }
    const isDestructivePath = normalizedPath
      .split('/')
      .filter(Boolean)
      .some((segment) =>
        tokenizePathSegment(segment).some((tok) => DESTRUCTIVE_PATH_TOKENS.has(tok))
      );
    return isDestructivePath ? 'destructive' : 'write';
  })();

  return { risk, isAdmin, warnings };
}

async function parseQueryParams({
  queryPairs,
  queryJson,
  readTextFile,
  readStdin
}: {
  queryPairs?: readonly string[];
  queryJson?: string;
  readTextFile: (path: string) => Promise<string>;
  readStdin: () => Promise<string>;
}): Promise<Record<string, string | number | boolean> | undefined> {
  const query: Record<string, string | number | boolean> = {};
  const seenKeys = new Set<string>();

  if (queryJson !== undefined) {
    const jsonObj = await resolveJsonObjectPayload({
      inlineJson: queryJson,
      readTextFile,
      readStdin,
      fieldLabel: '--query-json'
    });
    if (jsonObj) {
      for (const [key, val] of Object.entries(jsonObj)) {
        if (val === undefined) {
          continue;
        }
        if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
          throw new CliArgumentError(
            `Query parameter "${key}" in --query-json must be a string, number, or boolean.`
          );
        }
        if (typeof val === 'number' && !Number.isFinite(val)) {
          throw new CliArgumentError(`Query parameter "${key}" in --query-json must be finite.`);
        }
        seenKeys.add(key);
        query[key] = val;
      }
    }
  }

  for (const rawPair of queryPairs ?? []) {
    const eqIndex = rawPair.indexOf('=');
    if (eqIndex <= 0) {
      throw new CliArgumentError(
        `Invalid --query entry "${rawPair}". Expected key=value format.`,
        { entry: rawPair },
        'Example: --query id=68ad85a7463006c963799a05'
      );
    }
    const key = rawPair.slice(0, eqIndex).trim();
    const value = rawPair.slice(eqIndex + 1);
    if (!key) {
      throw new CliArgumentError(
        `Invalid --query entry "${rawPair}". Parameter key cannot be empty.`
      );
    }
    if (seenKeys.has(key)) {
      throw new CliArgumentError(
        `Duplicate query parameter "${key}".`,
        { key },
        'Specify each query parameter key once across --query and --query-json.'
      );
    }
    seenKeys.add(key);
    query[key] = value;
  }

  return Object.keys(query).length > 0 ? query : undefined;
}

function parseHeaderOptions(headerPairs?: readonly string[]): Record<string, string> | undefined {
  if (!headerPairs || headerPairs.length === 0) {
    return undefined;
  }

  const headers = new Map<string, { name: string; value: string }>();
  for (const rawHeader of headerPairs) {
    const colonIndex = rawHeader.indexOf(':');
    if (colonIndex <= 0) {
      throw new CliArgumentError(
        `Invalid --header entry "${rawHeader}". Expected "Name: Value" format.`,
        { entry: rawHeader },
        'Example: --header "X-Custom-Header: value"'
      );
    }
    const name = rawHeader.slice(0, colonIndex).trim();
    const value = rawHeader.slice(colonIndex + 1).trim();

    if (!name || !HEADER_NAME_REG.test(name)) {
      throw new CliArgumentError(`Invalid HTTP header name "${name}".`);
    }
    if (/[\r\n\0]/.test(value)) {
      throw new CliArgumentError(`Header "${name}" value contains invalid control characters.`);
    }

    const lowerName = name.toLowerCase();
    if (BLOCKED_AUTH_HEADERS.has(lowerName)) {
      throw new CliArgumentError(
        `Header "${name}" cannot be overridden via --header.`,
        { header: name },
        'Use --token or --api-key (or "fastgpt login") to configure authentication.'
      );
    }

    headers.set(lowerName, { name, value });
  }

  return Object.fromEntries([...headers.values()].map((item) => [item.name, item.value]));
}

function isTextContentType(contentType: string): boolean {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mime) {
    return false;
  }
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/ecmascript' ||
    mime === 'application/x-www-form-urlencoded' ||
    mime === 'application/yaml' ||
    mime === 'application/x-yaml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  );
}

/**
 * 创建通用 REST API 调用领域服务：负责路径防 SSRF 校验、动态破坏性风险门禁、OpenAPI 预检与安全发包。
 */
export function createApiCallerService({
  openapiCacheService,
  fileIo,
  prompter,
  readStdin
}: {
  openapiCacheService: OpenapiCacheService;
  fileIo: FileIoAdapter;
  prompter: Prompter;
  readStdin: () => Promise<string>;
}): ApiCallerService {
  return {
    execute: async ({ client, baseUrl, input }) => {
      // 1. 规范化方法、路径及查询/请求头/请求体输入（所有参数校验均在发包前完成）。
      const method = normalizeApiHttpMethod(input.method);
      const normalizedPath = normalizeApiRequestPath(input.path);
      const sourceLabel = input.source ?? 'system';
      const shouldValidate = input.validate !== false;

      const query = await parseQueryParams({
        queryPairs: input.queryPairs,
        queryJson: input.queryJson,
        readTextFile: (path) => fileIo.readTextFile(path),
        readStdin
      });

      const headers = parseHeaderOptions(input.headerPairs);

      const bodySourceCount = [
        input.body !== undefined,
        input.file !== undefined,
        input.stdin === true
      ].filter(Boolean).length;
      if (bodySourceCount > 1) {
        throw new CliArgumentError('Use only one of --body, --file, or --stdin.');
      }
      if (bodySourceCount > 0 && method === 'GET') {
        throw new CliArgumentError(
          'GET requests cannot include a request body.',
          undefined,
          'Pass query parameters via --query or --query-json instead.'
        );
      }

      const body =
        bodySourceCount > 0
          ? await resolveJsonPayload({
              inlineJson: input.body,
              filePath: input.file,
              useStdin: input.stdin === true,
              readTextFile: (path) => fileIo.readTextFile(path),
              readStdin,
              fieldLabel: 'request body'
            })
          : undefined;

      // 2. 动态判定风险等级并在高危操作执行前强制二次确认（早于任何网络请求）。
      const { risk, warnings: riskWarnings } = classifyApiRisk(method, normalizedPath);
      const allWarnings = [...riskWarnings];

      if (risk === 'destructive' && input.dryRun !== true) {
        const isNonInteractive = !prompter.isInteractive || input.format === 'json';
        if (isNonInteractive && input.yes !== true) {
          throw new CliArgumentError(
            `Destructive API request "${method} ${normalizedPath}" requires explicit confirmation in non-interactive / JSON mode.`,
            { method, path: normalizedPath, risk },
            'Pass --yes to confirm execution.'
          );
        }
        if (!isNonInteractive && input.yes !== true) {
          const confirmed = await prompter.confirm({
            message: `Execute destructive ${method} ${normalizedPath}?`,
            initialValue: false
          });
          if (!confirmed) {
            throw new CliArgumentError('API request cancelled by user.');
          }
        }
      }

      // 3. 若指定本地输出文件且未允许覆盖，在发出请求前提前拦截。
      if (input.output !== undefined && input.dryRun !== true) {
        const targetExists = await fileIo.exists(input.output);
        if (targetExists && input.overwrite !== true) {
          throw new CliArgumentError(
            `Output file "${input.output}" already exists.`,
            { outputPath: input.output },
            'Pass --overwrite to replace the existing file.'
          );
        }
      }

      // 4. OpenAPI 契约预检：--dry-run 绝不发出网络请求，仅在本地已有有效缓存时执行静态预检。
      const effectiveBaseUrl = baseUrl ?? client.baseUrl;
      const validated = await (async () => {
        if (!shouldValidate) {
          return false;
        }
        if (input.dryRun === true) {
          const cached = await openapiCacheService.readCachedDocument({
            baseUrl: effectiveBaseUrl,
            source: sourceLabel
          });
          if (!cached) {
            return false;
          }
          openapiCacheService.validateRequest({
            document: cached.document,
            source: cached.source,
            method,
            path: normalizedPath,
            query,
            body
          });
          return true;
        }

        const docResult = await openapiCacheService.getDocument({
          client,
          baseUrl: effectiveBaseUrl,
          source: sourceLabel,
          refresh: input.refresh === true
        });
        allWarnings.push(...docResult.warnings);
        openapiCacheService.validateRequest({
          document: docResult.document,
          source: docResult.source,
          method,
          path: normalizedPath,
          query,
          body
        });
        return true;
      })();

      // 5. --dry-run 仅返回脱敏后的预览结果，绝不触发真实接口请求。
      if (input.dryRun === true) {
        return createDryRunResult({
          operation: `api ${method.toLowerCase()}`,
          risk,
          ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
          preview: redactValue({
            method,
            path: normalizedPath,
            ...(query !== undefined ? { query } : {}),
            ...(headers !== undefined ? { headers } : {}),
            ...(body !== undefined ? { body } : {}),
            ...(input.output !== undefined ? { outputPath: input.output } : {}),
            validated
          })
        });
      }

      // 6. --raw 或 --output 走原始传输通道以支持文本/二进制下载与文件原子写入。
      if (input.raw === true || input.output !== undefined) {
        const rawHeaders = (() => {
          if (body === undefined) {
            return headers;
          }
          const hasContentType =
            headers !== undefined &&
            Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
          if (hasContentType) {
            return headers;
          }
          return {
            ...(headers ?? {}),
            'content-type': 'application/json'
          };
        })();

        const rawResponse = await client.requestRaw({
          method,
          path: normalizedPath,
          query,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          headers: rawHeaders
        });

        const bytes = new Uint8Array(await rawResponse.arrayBuffer());
        const contentType = rawResponse.headers.get('content-type') ?? 'application/octet-stream';

        if (input.output !== undefined) {
          const outputPath = await fileIo.writeBinaryAtomic({
            filePath: input.output,
            content: bytes
          });
          return createChangedResult({
            data: {
              outputPath,
              bytes: bytes.byteLength,
              status: rawResponse.status,
              contentType
            },
            message: `Saved ${bytes.byteLength} bytes to ${outputPath}.`,
            ...(allWarnings.length > 0 ? { warnings: allWarnings } : {})
          });
        }

        const isText = isTextContentType(contentType);
        const decodedBody = isText
          ? new TextDecoder('utf-8').decode(bytes)
          : Buffer.from(bytes).toString('base64');

        const rawPayload = {
          status: rawResponse.status,
          contentType,
          encoding: isText ? 'utf8' : 'base64',
          bytes: bytes.byteLength,
          body: decodedBody
        };

        return method === 'GET'
          ? createSuccessResult({
              data: rawPayload,
              ...(allWarnings.length > 0 ? { warnings: allWarnings } : {})
            })
          : createChangedResult({
              data: rawPayload,
              ...(allWarnings.length > 0 ? { warnings: allWarnings } : {})
            });
      }

      // 7. 默认走标准 FastGPT JSON 信封请求与解包。
      const responseData = await client.request({
        method,
        path: normalizedPath,
        query,
        body,
        headers
      });

      const warningsPayload = allWarnings.length > 0 ? { warnings: allWarnings } : {};
      return method === 'GET'
        ? createSuccessResult({ data: responseData, ...warningsPayload })
        : createChangedResult({ data: responseData, ...warningsPayload });
    }
  };
}
