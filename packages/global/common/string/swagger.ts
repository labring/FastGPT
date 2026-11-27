import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';
import { getErrorMessage, isUserConfigError, UserConfigError } from '../error/utils';

const INVALID_OPENAPI_SCHEMA_MESSAGE = 'Schema is not a valid OpenAPI API definition';
const EXTERNAL_REF_ERROR_MESSAGE = 'Unable to resolve $ref pointer: external $ref is not supported';
const SUPPORTED_OPENAPI_HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapeJsonPointerToken = (token: string) => token.replace(/~/g, '~0').replace(/\//g, '~1');

const resolveDocumentObject = (
  $refs: Pick<SwaggerParser['$refs'], 'get'>,
  value: unknown
): unknown => {
  const visitedRefs = new Set<string>();
  let current = value;

  while (
    isPlainObject(current) &&
    typeof current.$ref === 'string' &&
    current.$ref.startsWith('#')
  ) {
    if (visitedRefs.has(current.$ref)) return undefined;
    visitedRefs.add(current.$ref);
    try {
      current = $refs.get(current.$ref);
    } catch {
      return undefined;
    }
  }

  return current;
};

/**
 * 在调用 SwaggerParser 前拦截非文档内 `$ref`（如相对文件、file:// 或 http(s)://），
 * 避免依赖按进程 cwd 解析相对路径并在错误文案中泄露服务端目录。
 */
const assertNoExternalOpenAPIRefs = (schema: Record<string, any>) => {
  const visited = new WeakSet<object>();

  const walk = (node: unknown, segments: string[]) => {
    if (typeof node !== 'object' || node === null) return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...segments, String(index)]));
      return;
    }

    if (
      '$ref' in node &&
      typeof node.$ref === 'string' &&
      node.$ref.length > 0 &&
      !node.$ref.startsWith('#')
    ) {
      const pointer = segments.length > 0 ? `#/${segments.join('/')}` : '#';
      throw new UserConfigError(
        `Unable to resolve $ref pointer at ${pointer}: external $ref is not supported`
      );
    }

    for (const [key, value] of Object.entries(node)) {
      walk(value, [...segments, escapeJsonPointerToken(key)]);
    }
  };

  walk(schema, []);
};

/**
 * 校验工具转换与运行时 `str2OpenApiSchema` 依赖的最小文档结构，
 * 避免 `paths: null` 等可通过 swagger-parser 基础解析的无效文档进入后续执行链路。
 */
const assertValidOpenAPIToolDocument = (
  doc: Record<string, any>,
  $refs: Pick<SwaggerParser['$refs'], 'get'>
) => {
  if (!isPlainObject(doc.paths)) {
    throw new UserConfigError('Schema paths must be an object');
  }

  if (
    doc.servers !== undefined &&
    (!Array.isArray(doc.servers) || !doc.servers.every(isPlainObject))
  ) {
    throw new UserConfigError('Schema servers must be an array of objects');
  }

  for (const [pathKey, rawPathItem] of Object.entries(doc.paths)) {
    // OpenAPI Paths Object 允许以 x- 开头的扩展元数据（值可为标量、对象或 null），跳过不按路径项校验。
    if (pathKey.startsWith('x-')) continue;

    const pathPointer = `#/paths/${escapeJsonPointerToken(pathKey)}`;
    const pathItem = resolveDocumentObject($refs, rawPathItem);
    if (!isPlainObject(pathItem)) {
      throw new UserConfigError(`Invalid OpenAPI path item at ${pathPointer}`);
    }

    if (
      pathItem.parameters !== undefined &&
      (!Array.isArray(pathItem.parameters) ||
        !pathItem.parameters.every((item) => isPlainObject(resolveDocumentObject($refs, item))))
    ) {
      throw new UserConfigError(`Invalid OpenAPI parameters at ${pathPointer}/parameters`);
    }

    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!SUPPORTED_OPENAPI_HTTP_METHODS.has(method.toLowerCase())) continue;

      const operationPointer = `${pathPointer}/${escapeJsonPointerToken(method)}`;
      const operation = resolveDocumentObject($refs, rawOperation);
      if (!isPlainObject(operation)) {
        throw new UserConfigError(`Invalid OpenAPI operation at ${operationPointer}`);
      }

      if (
        !operation.deprecated &&
        operation.parameters !== undefined &&
        (!Array.isArray(operation.parameters) ||
          !operation.parameters.every((item) => isPlainObject(resolveDocumentObject($refs, item))))
      ) {
        throw new UserConfigError(`Invalid OpenAPI parameters at ${operationPointer}/parameters`);
      }
    }
  }
};

const formatOpenAPISchemaErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error, INVALID_OPENAPI_SCHEMA_MESSAGE);
  if (message.startsWith('[object Object] is not a valid ')) {
    return message.replace('[object Object]', 'Schema');
  }
  if (/Unable to resolve \$ref pointer\b/i.test(message)) {
    return EXTERNAL_REF_ERROR_MESSAGE;
  }
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    const cwd = process.cwd();
    if (cwd && message.includes(cwd)) {
      return INVALID_OPENAPI_SCHEMA_MESSAGE;
    }
  }
  return message;
};

/**
 * 解析用户导入的 OpenAPI 文档字符串。
 *
 * URL 导入场景会先由服务端受控下载文本，再交给该函数解析，避免把 URL
 * 直接传给 SwaggerParser 触发其内置远程 resolver。
 */
export const parseOpenAPISchemaString = (schemaText: string): Record<string, any> => {
  if (typeof schemaText !== 'string' || !schemaText.trim()) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  const parsed = (() => {
    try {
      return JSON.parse(schemaText);
    } catch {
      try {
        return yaml.load(schemaText, { schema: yaml.FAILSAFE_SCHEMA });
      } catch (error) {
        throw new UserConfigError(
          getErrorMessage(error, INVALID_OPENAPI_SCHEMA_MESSAGE),
          undefined,
          { cause: error }
        );
      }
    }
  })();

  if (!isPlainObject(parsed)) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  return parsed;
};

/**
 * 仅对已取得的 OpenAPI 对象做本地 bundle 与工具结构校验。
 *
 * 禁止 SwaggerParser 的 file/http resolver，并在调用前拦截非文档内 `$ref`，
 * 防止 OpenAPI URL 导入后解析远程/本地文件引用或泄露服务端工作目录。
 */
export const bundleOpenAPISchema = async (schema: unknown): Promise<Record<string, any>> => {
  if (!isPlainObject(schema)) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  // swagger-parser 仅判断 info === undefined，info 为 null/标量时读取 info.version 会抛 TypeError，提前收口。
  if (schema.info !== undefined && !isPlainObject(schema.info)) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  assertNoExternalOpenAPIRefs(schema);

  const parser = new SwaggerParser();
  const bundled = await (async () => {
    try {
      return await parser.bundle(schema as any, {
        resolve: {
          file: false,
          http: false
        }
      });
    } catch (error) {
      if (isUserConfigError(error)) {
        throw error;
      }
      throw new UserConfigError(formatOpenAPISchemaErrorMessage(error), undefined, {
        cause: error
      });
    }
  })();

  if (!isPlainObject(bundled)) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  assertValidOpenAPIToolDocument(bundled, parser.$refs);

  return bundled;
};
