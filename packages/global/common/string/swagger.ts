import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';

/**
 * 解析用户导入的 OpenAPI 文档字符串。
 *
 * URL 导入场景会先由服务端受控下载文本，再交给该函数解析，避免把 URL
 * 直接传给 SwaggerParser 触发其内置远程 resolver。
 */
export const parseOpenAPISchemaString = (schemaText: string) => {
  try {
    return JSON.parse(schemaText);
  } catch {
    return yaml.load(schemaText, { schema: yaml.FAILSAFE_SCHEMA });
  }
};

/**
 * 仅对已取得的 OpenAPI 对象做本地 bundle。
 *
 * 禁止 SwaggerParser 的 file/http resolver，防止 OpenAPI URL 导入后继续解析
 * 远程 `$ref`，绕过服务端 SSRF 校验。
 */
export const bundleOpenAPISchema = async (schema: unknown) => {
  return SwaggerParser.bundle(schema as any, {
    resolve: {
      file: false,
      http: false
    }
  });
};
