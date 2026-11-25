import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';
import { getErrorMessage, isUserConfigError, UserConfigError } from '../error/utils';

const INVALID_OPENAPI_SCHEMA_MESSAGE = 'Schema is not a valid OpenAPI API definition';

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const formatOpenAPISchemaErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error, INVALID_OPENAPI_SCHEMA_MESSAGE);
  if (message.startsWith('[object Object] is not a valid ')) {
    return message.replace('[object Object]', 'Schema');
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
 * 仅对已取得的 OpenAPI 对象做本地 bundle。
 *
 * 禁止 SwaggerParser 的 file/http resolver，防止 OpenAPI URL 导入后继续解析
 * 远程 `$ref`，绕过服务端 SSRF 校验。
 */
export const bundleOpenAPISchema = async (schema: unknown): Promise<Record<string, any>> => {
  if (!isPlainObject(schema)) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  // swagger-parser 仅判断 info === undefined，info 为 null/标量时读取 info.version 会抛 TypeError，提前收口。
  if (schema.info !== undefined && !isPlainObject(schema.info)) {
    throw new UserConfigError(INVALID_OPENAPI_SCHEMA_MESSAGE);
  }

  try {
    return (await SwaggerParser.bundle(schema as any, {
      resolve: {
        file: false,
        http: false
      }
    })) as Record<string, any>;
  } catch (error) {
    if (isUserConfigError(error)) {
      throw error;
    }
    throw new UserConfigError(formatOpenAPISchemaErrorMessage(error), undefined, { cause: error });
  }
};
