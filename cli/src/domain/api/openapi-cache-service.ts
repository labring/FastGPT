import type {
  ApidocCacheStore,
  ApidocSource,
  CachedApidocEntry
} from '../../infra/cache/apidoc-cache-store';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../shared/errors';
import { isPlainObject } from '../../shared/input';
import { normalizeApiRequestPath, type ApiHttpMethod } from './api-caller-service';

export const DEFAULT_APIDOC_TTL_MS = 24 * 60 * 60 * 1000;

export const APIDOC_SOURCE_PATHS: Record<ApidocSource, string> = {
  system: '/apidoc/systemopenapi.json',
  dev: '/apidoc/devapi.json'
};

const OPENAPI_HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;

const MAX_REF_EXPANSION_DEPTH = 6;
const MAX_STRUCT_EXPANSION_DEPTH = 24;

export type OpenapiDocumentResult = CachedApidocEntry & {
  fromCache: boolean;
  warnings: string[];
};

export type OpenapiEndpointSummary = {
  path: string;
  methods: string[];
  summary?: string;
  tags: string[];
  deprecated: boolean;
};

export type OpenapiResolvedParameter = {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema?: unknown;
};

export type OpenapiResolvedRequestBody = {
  required: boolean;
  contentType?: string;
  requiredFields: string[];
  schema?: unknown;
  content?: Record<string, unknown>;
};

export type OpenapiOperationDetail = {
  method: string;
  summary?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: OpenapiResolvedParameter[];
  requestBody?: OpenapiResolvedRequestBody;
  responses: Record<string, unknown>;
};

export type OpenapiSchemaListResult = {
  mode: 'list';
  source: ApidocSource;
  baseUrl: string;
  fetchedAt: number;
  fromCache: boolean;
  total: number;
  endpoints: OpenapiEndpointSummary[];
  warnings: string[];
};

export type OpenapiSchemaDetailResult = {
  mode: 'detail';
  source: ApidocSource;
  baseUrl: string;
  fetchedAt: number;
  fromCache: boolean;
  path: string;
  operations: OpenapiOperationDetail[];
  warnings: string[];
};

export type OpenapiSchemaInspectResult = OpenapiSchemaListResult | OpenapiSchemaDetailResult;

export type OpenapiCacheService = {
  getDocument: (params: {
    client?: FastGptHttpClient;
    baseUrl?: string;
    source?: string;
    refresh?: boolean;
    offline?: boolean;
    ttlMs?: number;
    now?: number;
  }) => Promise<OpenapiDocumentResult>;
  readCachedDocument: (params: {
    baseUrl: string;
    source?: string;
    ttlMs?: number;
    now?: number;
  }) => Promise<OpenapiDocumentResult | undefined>;
  inspectSchema: (params: {
    client?: FastGptHttpClient;
    baseUrl?: string;
    source?: string;
    path?: string;
    tag?: string;
    search?: string;
    method?: string;
    refresh?: boolean;
    offline?: boolean;
    ttlMs?: number;
    now?: number;
  }) => Promise<OpenapiSchemaInspectResult>;
  validateRequest: (params: {
    document: Record<string, unknown>;
    source: ApidocSource;
    method: ApiHttpMethod;
    path: string;
    query?: Record<string, string | number | boolean>;
    body?: unknown;
  }) => void;
};

/**
 * 校验并规范化 OpenAPI 文档来源参数（默认 `system`）。
 */
export function parseApidocSource(raw?: string): ApidocSource {
  if (raw === undefined) {
    return 'system';
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'system' || normalized === 'dev') {
    return normalized;
  }
  throw new CliArgumentError(
    `Invalid OpenAPI source "${raw}". Expected "system" or "dev".`,
    { source: raw },
    'Pass --source system or --source dev.'
  );
}

function resolveJsonPointer(doc: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  const segments = ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = doc;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (isPlainObject(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function resolveOpenApiNode({
  value,
  doc,
  visited = new Set<string>(),
  refDepth = 0,
  structDepth = 0
}: {
  value: unknown;
  doc: Record<string, unknown>;
  visited?: Set<string>;
  refDepth?: number;
  structDepth?: number;
}): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (structDepth >= MAX_STRUCT_EXPANSION_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveOpenApiNode({
        value: item,
        doc,
        visited,
        refDepth,
        structDepth: structDepth + 1
      })
    );
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (typeof value.$ref === 'string') {
    const ref = value.$ref;
    if (visited.has(ref)) {
      return { ...value, circular: true };
    }
    if (refDepth >= MAX_REF_EXPANSION_DEPTH) {
      return { ...value, truncated: true };
    }

    const target = resolveJsonPointer(doc, ref);
    if (target === undefined) {
      return value;
    }

    // 分支内独立记录已访问过的 $ref，避免兄弟分支互相误判为循环引用。
    const nextVisited = new Set(visited);
    nextVisited.add(ref);

    const expandedTarget = resolveOpenApiNode({
      value: target,
      doc,
      visited: nextVisited,
      refDepth: refDepth + 1,
      structDepth: structDepth + 1
    });

    const { $ref: _ignoredRef, ...siblings } = value;
    if (Object.keys(siblings).length === 0) {
      return expandedTarget;
    }

    const expandedSiblings = resolvePlainObjectFields({
      obj: siblings,
      doc,
      visited: nextVisited,
      refDepth,
      structDepth: structDepth + 1
    });
    if (isPlainObject(expandedTarget)) {
      return { ...expandedTarget, ...expandedSiblings };
    }
    return expandedTarget;
  }

  return resolvePlainObjectFields({
    obj: value,
    doc,
    visited,
    refDepth,
    structDepth
  });
}

function resolvePlainObjectFields({
  obj,
  doc,
  visited,
  refDepth,
  structDepth
}: {
  obj: Record<string, unknown>;
  doc: Record<string, unknown>;
  visited: Set<string>;
  refDepth: number;
  structDepth: number;
}): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(obj)) {
    result[key] = resolveOpenApiNode({
      value: fieldValue,
      doc,
      visited,
      refDepth,
      structDepth: structDepth + 1
    });
  }
  return result;
}

function extractRequiredFields(schema: unknown): string[] {
  if (!isPlainObject(schema)) {
    return [];
  }
  const fields: string[] = [];
  if (Array.isArray(schema.required)) {
    for (const item of schema.required) {
      if (typeof item === 'string' && !fields.includes(item)) {
        fields.push(item);
      }
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) {
      for (const field of extractRequiredFields(part)) {
        if (!fields.includes(field)) {
          fields.push(field);
        }
      }
    }
  }
  return fields;
}

function resolveParameters({
  pathItem,
  operation,
  doc
}: {
  pathItem: Record<string, unknown>;
  operation: Record<string, unknown>;
  doc: Record<string, unknown>;
}): OpenapiResolvedParameter[] {
  const combined = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : [])
  ];

  const byKey = new Map<string, OpenapiResolvedParameter>();
  for (const rawParam of combined) {
    const resolved = resolveOpenApiNode({ value: rawParam, doc });
    if (!isPlainObject(resolved) || typeof resolved.name !== 'string') {
      continue;
    }
    const location = typeof resolved.in === 'string' ? resolved.in : 'query';
    const entry: OpenapiResolvedParameter = {
      name: resolved.name,
      in: location,
      required: resolved.required === true,
      ...(typeof resolved.description === 'string' ? { description: resolved.description } : {}),
      ...(resolved.schema !== undefined ? { schema: resolved.schema } : {})
    };
    byKey.set(`${location}:${entry.name}`, entry);
  }
  return [...byKey.values()];
}

function resolveRequestBody({
  operation,
  doc
}: {
  operation: Record<string, unknown>;
  doc: Record<string, unknown>;
}): OpenapiResolvedRequestBody | undefined {
  if (operation.requestBody === undefined) {
    return undefined;
  }
  const resolved = resolveOpenApiNode({ value: operation.requestBody, doc });
  if (!isPlainObject(resolved)) {
    return undefined;
  }

  const content = isPlainObject(resolved.content) ? resolved.content : undefined;
  const preferredEntry = (() => {
    if (!content) {
      return undefined;
    }
    if (isPlainObject(content['application/json'])) {
      return { contentType: 'application/json', media: content['application/json'] };
    }
    const firstKey = Object.keys(content)[0];
    if (firstKey && isPlainObject(content[firstKey])) {
      return { contentType: firstKey, media: content[firstKey] };
    }
    return undefined;
  })();

  const schema =
    preferredEntry && isPlainObject(preferredEntry.media) ? preferredEntry.media.schema : undefined;
  const requiredFields = extractRequiredFields(schema);

  return {
    required: resolved.required === true || requiredFields.length > 0,
    ...(preferredEntry ? { contentType: preferredEntry.contentType } : {}),
    requiredFields,
    ...(schema !== undefined ? { schema } : {}),
    ...(content ? { content } : {})
  };
}

function resolveResponses({
  operation,
  doc
}: {
  operation: Record<string, unknown>;
  doc: Record<string, unknown>;
}): Record<string, unknown> {
  if (!isPlainObject(operation.responses)) {
    return {};
  }
  const resolved = resolveOpenApiNode({ value: operation.responses, doc });
  return isPlainObject(resolved) ? resolved : {};
}

function findEndpointPathItem(
  paths: Record<string, unknown>,
  normalizedPath: string
): { matchedPath: string; pathItem: Record<string, unknown> } | undefined {
  const direct = paths[normalizedPath];
  if (isPlainObject(direct)) {
    return { matchedPath: normalizedPath, pathItem: direct };
  }

  const prefixedPath = normalizedPath === '/' ? '/api' : `/api${normalizedPath}`;
  const prefixed = paths[prefixedPath];
  if (isPlainObject(prefixed)) {
    return { matchedPath: prefixedPath, pathItem: prefixed };
  }

  return undefined;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function suggestClosestPaths(
  paths: Record<string, unknown>,
  targetPath: string,
  limit = 5
): string[] {
  const targetLower = targetPath.toLowerCase();
  const targetSegments = targetLower.split('/').filter(Boolean);
  const lastTargetSeg = targetSegments[targetSegments.length - 1] ?? '';

  const scored = Object.keys(paths)
    .map((candidate) => {
      const candLower = candidate.toLowerCase();
      const candSegments = candLower.split('/').filter(Boolean);
      const lastCandSeg = candSegments[candSegments.length - 1] ?? '';

      let score = 0;
      if (candLower.includes(targetLower) || targetLower.includes(candLower)) {
        score += 50;
      }
      for (const seg of targetSegments) {
        if (candSegments.includes(seg)) {
          score += 15;
        }
      }
      if (
        lastTargetSeg &&
        lastCandSeg &&
        (lastCandSeg.includes(lastTargetSeg) || lastTargetSeg.includes(lastCandSeg))
      ) {
        score += 15;
      }

      const distance = levenshteinDistance(targetLower, candLower);
      return { candidate, score, distance };
    })
    .filter(
      (item) => item.score > 0 || item.distance <= Math.max(4, Math.floor(targetLower.length * 0.5))
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.candidate.localeCompare(b.candidate);
    });

  return scored.slice(0, limit).map((item) => item.candidate);
}

function collectPathOperations(
  pathItem: Record<string, unknown>
): Array<[string, Record<string, unknown>]> {
  const ops: Array<[string, Record<string, unknown>]> = [];
  for (const method of OPENAPI_HTTP_METHODS) {
    const candidate = pathItem[method];
    if (isPlainObject(candidate)) {
      ops.push([method, candidate]);
    }
  }
  return ops;
}

function normalizeTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }
  return rawTags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
}

/**
 * 创建 OpenAPI 文档缓存与 Schema 自省领域服务，支持本地 TTL 缓存、离线读取、`--refresh` 强制更新及循环引用安全展开。
 */
export function createOpenapiCacheService({
  cacheStore
}: {
  cacheStore: ApidocCacheStore;
}): OpenapiCacheService {
  const getDocument: OpenapiCacheService['getDocument'] = async ({
    client,
    baseUrl,
    source: rawSource,
    refresh = false,
    offline = false,
    ttlMs = DEFAULT_APIDOC_TTL_MS,
    now = Date.now()
  }) => {
    const source = parseApidocSource(rawSource);
    const effectiveBaseUrl = baseUrl ?? client?.baseUrl;
    if (!effectiveBaseUrl) {
      throw new CliArgumentError('Base URL is required to resolve OpenAPI schema.');
    }

    if (refresh && offline) {
      throw new CliArgumentError(
        'Cannot use --refresh and --offline together.',
        undefined,
        'Remove --offline to fetch the latest OpenAPI schema, or remove --refresh to read from cache.'
      );
    }

    // 1. 优先读取本地缓存；仅在未过期（或处于离线模式）时直接复用。
    if (!refresh) {
      const cached = await cacheStore.read({ baseUrl: effectiveBaseUrl, source });
      if (cached) {
        const isExpired = now - cached.fetchedAt > ttlMs;
        if (!isExpired) {
          return {
            ...cached,
            fromCache: true,
            warnings: []
          };
        }
        if (offline) {
          return {
            ...cached,
            fromCache: true,
            warnings: [
              `Cached "${source}" OpenAPI schema is older than TTL; using stale cache in offline mode.`
            ]
          };
        }
      }
    }

    // 2. 离线模式下缺失本地缓存必须显式报错，禁止发出网络请求。
    if (offline) {
      throw new CliArgumentError(
        `No cached "${source}" OpenAPI schema found for "${effectiveBaseUrl}" in offline mode.`,
        { baseUrl: effectiveBaseUrl, source },
        `Run "fastgpt api schema --source ${source}" while online first.`
      );
    }

    if (!client) {
      throw new CliArgumentError('Active HTTP client is required to fetch OpenAPI schema.');
    }

    // 3. 从服务端拉取 OpenAPI 文档，对 404 场景给出明确的 --no-validate / --source 提示。
    const endpoint = APIDOC_SOURCE_PATHS[source];
    const rawDoc = await (async () => {
      try {
        return await client.request<unknown>({
          method: 'GET',
          path: endpoint
        });
      } catch (error) {
        if (error instanceof CliApiError && error.httpStatus === 404) {
          throw new CliApiError({
            httpStatus: 404,
            serverCode: error.serverCode,
            statusText: error.statusText,
            message: `OpenAPI schema endpoint "${endpoint}" returned HTTP 404 on "${effectiveBaseUrl}".`,
            hint:
              source === 'system'
                ? 'Pass --no-validate to skip schema validation, or try --source dev.'
                : 'Pass --no-validate to skip schema validation.',
            details: { endpoint, source, baseUrl: effectiveBaseUrl }
          });
        }
        throw error;
      }
    })();

    if (!isPlainObject(rawDoc)) {
      throw new CliApiError({
        message: `Invalid OpenAPI schema payload returned from "${endpoint}".`,
        hint: 'Pass --no-validate to bypass OpenAPI validation.',
        details: { endpoint, source }
      });
    }

    const entry: CachedApidocEntry = {
      fetchedAt: now,
      source,
      baseUrl: effectiveBaseUrl,
      document: rawDoc
    };
    await cacheStore.write(entry);

    return {
      ...entry,
      fromCache: false,
      warnings: []
    };
  };

  const readCachedDocument: OpenapiCacheService['readCachedDocument'] = async ({
    baseUrl,
    source: rawSource,
    ttlMs = DEFAULT_APIDOC_TTL_MS,
    now = Date.now()
  }) => {
    const source = parseApidocSource(rawSource);
    const cached = await cacheStore.read({ baseUrl, source });
    if (!cached || now - cached.fetchedAt > ttlMs) {
      return undefined;
    }
    return {
      ...cached,
      fromCache: true,
      warnings: []
    };
  };

  const inspectSchema: OpenapiCacheService['inspectSchema'] = async ({
    client,
    baseUrl,
    source: rawSource,
    path,
    tag,
    search,
    method,
    refresh = false,
    offline = false,
    ttlMs = DEFAULT_APIDOC_TTL_MS,
    now = Date.now()
  }) => {
    const docResult = await getDocument({
      client,
      baseUrl,
      source: rawSource,
      refresh,
      offline,
      ttlMs,
      now
    });

    const paths = isPlainObject(docResult.document.paths) ? docResult.document.paths : {};
    const methodFilter = method?.trim().toUpperCase() || undefined;
    const tagFilter = tag?.trim().toLowerCase() || undefined;
    const searchFilter = search?.trim().toLowerCase() || undefined;

    if (path !== undefined) {
      const normalizedPath = normalizeApiRequestPath(path);
      const found = findEndpointPathItem(paths, normalizedPath);
      if (!found) {
        const suggestions = suggestClosestPaths(paths, normalizedPath);
        const suggestionPart =
          suggestions.length > 0 ? `Did you mean: ${suggestions.join(', ')}? ` : '';
        const sourcePart =
          docResult.source === 'system'
            ? 'Try --source dev for internal/console endpoints, or run'
            : 'Run';
        throw new CliArgumentError(
          `Endpoint "${normalizedPath}" was not found in "${docResult.source}" OpenAPI schema.`,
          { path: normalizedPath, source: docResult.source, suggestions },
          `${suggestionPart}${sourcePart} "fastgpt api schema --source ${docResult.source}" to list endpoints.`
        );
      }

      const allOps = collectPathOperations(found.pathItem);
      const selectedOps = methodFilter
        ? allOps.filter(([m]) => m.toUpperCase() === methodFilter)
        : allOps;

      if (methodFilter && selectedOps.length === 0) {
        const availableMethods = allOps.map(([m]) => m.toUpperCase());
        throw new CliArgumentError(
          `HTTP method ${methodFilter} is not defined for "${found.matchedPath}" in "${docResult.source}" OpenAPI schema.`,
          { path: found.matchedPath, method: methodFilter, availableMethods },
          `Available method(s): ${availableMethods.join(', ') || 'none'}.`
        );
      }

      const operations: OpenapiOperationDetail[] = selectedOps.map(([methodKey, opObj]) => ({
        method: methodKey.toUpperCase(),
        ...(typeof opObj.summary === 'string' ? { summary: opObj.summary } : {}),
        ...(typeof opObj.description === 'string' ? { description: opObj.description } : {}),
        tags: normalizeTags(opObj.tags),
        deprecated: opObj.deprecated === true,
        parameters: resolveParameters({
          pathItem: found.pathItem,
          operation: opObj,
          doc: docResult.document
        }),
        ...(opObj.requestBody !== undefined
          ? { requestBody: resolveRequestBody({ operation: opObj, doc: docResult.document }) }
          : {}),
        responses: resolveResponses({ operation: opObj, doc: docResult.document })
      }));

      return {
        mode: 'detail',
        source: docResult.source,
        baseUrl: docResult.baseUrl,
        fetchedAt: docResult.fetchedAt,
        fromCache: docResult.fromCache,
        path: found.matchedPath,
        operations,
        warnings: docResult.warnings
      };
    }

    const endpoints: OpenapiEndpointSummary[] = [];
    for (const [endpointPath, rawPathItem] of Object.entries(paths)) {
      if (!isPlainObject(rawPathItem)) {
        continue;
      }
      const matchedOps = collectPathOperations(rawPathItem).filter(([methodKey, opObj]) => {
        if (methodFilter && methodKey.toUpperCase() !== methodFilter) {
          return false;
        }
        const opTags = normalizeTags(opObj.tags);
        if (tagFilter && !opTags.some((item) => item.toLowerCase() === tagFilter)) {
          return false;
        }
        if (searchFilter) {
          const summary = typeof opObj.summary === 'string' ? opObj.summary.toLowerCase() : '';
          const description =
            typeof opObj.description === 'string' ? opObj.description.toLowerCase() : '';
          const matchesSearch =
            endpointPath.toLowerCase().includes(searchFilter) ||
            summary.includes(searchFilter) ||
            description.includes(searchFilter) ||
            opTags.some((item) => item.toLowerCase().includes(searchFilter));
          if (!matchesSearch) {
            return false;
          }
        }
        return true;
      });

      if (matchedOps.length === 0) {
        continue;
      }

      const summaries = matchedOps
        .map(([, op]) => (typeof op.summary === 'string' ? op.summary.trim() : ''))
        .filter(Boolean);
      const tags = [...new Set(matchedOps.flatMap(([, op]) => normalizeTags(op.tags)))];

      endpoints.push({
        path: endpointPath,
        methods: matchedOps.map(([m]) => m.toUpperCase()),
        ...(summaries.length > 0 ? { summary: summaries[0] } : {}),
        tags,
        deprecated: matchedOps.every(([, op]) => op.deprecated === true)
      });
    }

    endpoints.sort((a, b) => a.path.localeCompare(b.path));

    return {
      mode: 'list',
      source: docResult.source,
      baseUrl: docResult.baseUrl,
      fetchedAt: docResult.fetchedAt,
      fromCache: docResult.fromCache,
      total: endpoints.length,
      endpoints,
      warnings: docResult.warnings
    };
  };

  const validateRequest: OpenapiCacheService['validateRequest'] = ({
    document,
    source,
    method,
    path,
    query,
    body
  }) => {
    const paths = isPlainObject(document.paths) ? document.paths : {};
    const found = findEndpointPathItem(paths, path);
    if (!found) {
      const suggestions = suggestClosestPaths(paths, path);
      const suggestionPart =
        suggestions.length > 0 ? `Did you mean: ${suggestions.join(', ')}? ` : '';
      const sourcePart =
        source === 'system'
          ? 'Try --source dev if this is an internal/console endpoint, or pass --no-validate to skip schema validation.'
          : 'Pass --no-validate to skip schema validation.';
      throw new CliArgumentError(
        `API path "${path}" was not found in "${source}" OpenAPI schema.`,
        { path, source, suggestions },
        `${suggestionPart}${sourcePart}`
      );
    }

    const operation = found.pathItem[method.toLowerCase()];
    if (!isPlainObject(operation)) {
      const availableMethods = collectPathOperations(found.pathItem).map(([m]) => m.toUpperCase());
      throw new CliArgumentError(
        `HTTP method ${method} is not supported on "${found.matchedPath}" in "${source}" OpenAPI schema.`,
        { path: found.matchedPath, method, availableMethods },
        `Available method(s): ${availableMethods.join(', ') || 'none'}.${source === 'system' ? ' Try --source dev or pass --no-validate.' : ' Pass --no-validate to skip validation.'}`
      );
    }

    // 1. 校验必填 query 参数。
    const parameters = resolveParameters({
      pathItem: found.pathItem,
      operation,
      doc: document
    });
    const missingQueryParams = parameters
      .filter((param) => param.in === 'query' && param.required)
      .filter(
        (param) =>
          query === undefined ||
          !Object.prototype.hasOwnProperty.call(query, param.name) ||
          query[param.name] === undefined
      )
      .map((param) => param.name);

    if (missingQueryParams.length > 0) {
      throw new CliArgumentError(
        `Missing required query parameter(s) for ${method} ${found.matchedPath}: ${missingQueryParams.join(', ')}.`,
        { method, path: found.matchedPath, missingQueryParams },
        `Pass via --query ${missingQueryParams[0]}=<value> or --query-json (or pass --no-validate).`
      );
    }

    // 2. 校验必填 requestBody 及顶层必填属性。
    const resolvedBody = resolveRequestBody({ operation, doc: document });
    if (!resolvedBody) {
      return;
    }

    if (resolvedBody.requiredFields.length > 0) {
      if (body !== undefined && !isPlainObject(body)) {
        throw new CliArgumentError(
          `Request body for ${method} ${found.matchedPath} must be a JSON object.`,
          { method, path: found.matchedPath },
          `Run "fastgpt api schema ${found.matchedPath} --source ${source}" to inspect the schema, or pass --no-validate.`
        );
      }

      const bodyObj = isPlainObject(body) ? body : {};
      const missingBodyFields = resolvedBody.requiredFields.filter(
        (field) =>
          !Object.prototype.hasOwnProperty.call(bodyObj, field) || bodyObj[field] === undefined
      );
      if (missingBodyFields.length > 0) {
        throw new CliArgumentError(
          `Missing required body field(s) for ${method} ${found.matchedPath}: ${missingBodyFields.join(', ')}.`,
          {
            method,
            path: found.matchedPath,
            missingBodyFields,
            requiredFields: resolvedBody.requiredFields
          },
          `Run "fastgpt api schema ${found.matchedPath} --source ${source}" to inspect required fields, or pass --no-validate.`
        );
      }
      return;
    }

    if (resolvedBody.required && body === undefined) {
      throw new CliArgumentError(
        `Request body is required for ${method} ${found.matchedPath}.`,
        { method, path: found.matchedPath },
        'Pass --body, --file, or --stdin (or pass --no-validate to skip schema validation).'
      );
    }

    if (
      body !== undefined &&
      isPlainObject(resolvedBody.schema) &&
      resolvedBody.schema.type === 'object' &&
      !isPlainObject(body)
    ) {
      throw new CliArgumentError(
        `Request body for ${method} ${found.matchedPath} must be a JSON object.`,
        { method, path: found.matchedPath },
        'Pass a JSON object via --body, --file, or --stdin (or pass --no-validate).'
      );
    }
  };

  return {
    getDocument,
    readCachedDocument,
    inspectSchema,
    validateRequest
  };
}
