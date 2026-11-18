import type { JSONSchemaInputType } from '../../jsonschema';

const isSchemaRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const schemaAllowsNull = (schema: unknown): boolean => {
  if (!isSchemaRecord(schema)) return false;
  if (schema.nullable === true || schema.type === 'null') return true;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && schema.const === null) return true;
  if (Array.isArray(schema.enum) && schema.enum.includes(null)) return true;

  if (Array.isArray(schema.anyOf) && schema.anyOf.some(schemaAllowsNull)) return true;
  if (Array.isArray(schema.oneOf) && schema.oneOf.some(schemaAllowsNull)) return true;
  if (
    Array.isArray(schema.allOf) &&
    schema.allOf.length > 0 &&
    schema.allOf.every(schemaAllowsNull)
  ) {
    return true;
  }

  return false;
};

const isNonStringTypedSchema = (schema: unknown): boolean => {
  if (!isSchemaRecord(schema)) return false;
  if (typeof schema.type === 'string') return schema.type !== 'string';

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((item): item is string => typeof item === 'string');
    return types.length > 0 && !types.includes('string');
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return typeof schema.const !== 'string';
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return !schema.enum.some((item) => typeof item === 'string');
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return schema.anyOf.every(isNonStringTypedSchema);
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf.every(isNonStringTypedSchema);
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return schema.allOf.some(isNonStringTypedSchema);
  }

  return false;
};

/**
 * 清理系统工具顶层非必填字段中的无效空值，避免 Zod `.optional()` 因收到 `null` 或非字符串字段的 `''` 而校验失败。
 *
 * - 缺少 `inputSchema` 或 `properties` 时原样透传；
 * - 必填字段（`required`）保留原值，由插件侧校验处理；
 * - 仅在 schema 未显式允许 `null` 时移除 `null` / `undefined`，保留 `.nullable()` 等合法 `null` 语义；
 * - 仅在字段声明类型不包含 `string` 时移除 `''`，避免误删可选文本字段的空字符串。
 */
export const stripUnsetOptionalToolInputs = ({
  input,
  inputSchema
}: {
  input: Record<string, any>;
  inputSchema?: JSONSchemaInputType;
}): Record<string, any> => {
  if (!inputSchema || !isSchemaRecord(inputSchema.properties)) {
    return input;
  }

  const requiredKeys = new Set(Array.isArray(inputSchema.required) ? inputSchema.required : []);
  const properties = inputSchema.properties;

  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (requiredKeys.has(key)) return true;

      const propSchema = properties[key];
      if (propSchema === undefined) return true;

      if (value === undefined) return false;
      if (value === null) return schemaAllowsNull(propSchema);
      if (value === '' && isNonStringTypedSchema(propSchema)) return false;

      return true;
    })
  );
};
