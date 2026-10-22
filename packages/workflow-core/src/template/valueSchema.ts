import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { WorkflowCommandError } from '../domain/diagnostic';

type JsonSchema = {
  type?: string | string[];
  const?: unknown;
  required?: string[] | boolean;
  properties?: Record<string, JsonSchema | boolean>;
  patternProperties?: Record<string, JsonSchema | boolean>;
  items?: JsonSchema | (JsonSchema | boolean)[] | boolean;
  prefixItems?: (JsonSchema | boolean)[];
  enum?: unknown[];
  anyOf?: (JsonSchema | boolean)[];
  oneOf?: (JsonSchema | boolean)[];
  allOf?: (JsonSchema | boolean)[];
  not?: JsonSchema | boolean;
  additionalProperties?: boolean | JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};

const valuesEqual = (left: unknown, right: unknown) =>
  Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

const valueMatchesType = (value: unknown, type: string) => {
  if (type === 'null') return value === null;
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  return true;
};

/** 校验固定值使用的 JSON Schema 子集，兼容旧工具必填标记，不修改输入或 Schema。 */
export const valueMatchesSchema = (
  value: unknown,
  schema: Record<string, unknown> | boolean
): boolean => {
  // JSON Schema 允许 true/false 作为完整规则；联合类型中的 false 不能被计为匹配分支。
  if (typeof schema === 'boolean') return schema;
  const parsedSchema = schema as JsonSchema;
  if (parsedSchema.const !== undefined && !valuesEqual(parsedSchema.const, value)) return false;
  if (parsedSchema.enum && !parsedSchema.enum.some((item) => valuesEqual(item, value)))
    return false;
  if (parsedSchema.anyOf && !parsedSchema.anyOf.some((item) => valueMatchesSchema(value, item))) {
    return false;
  }
  if (
    parsedSchema.oneOf &&
    parsedSchema.oneOf.filter((item) => valueMatchesSchema(value, item)).length !== 1
  ) {
    return false;
  }
  if (parsedSchema.allOf && !parsedSchema.allOf.every((item) => valueMatchesSchema(value, item))) {
    return false;
  }
  if (parsedSchema.not && valueMatchesSchema(value, parsedSchema.not)) return false;
  if (parsedSchema.type) {
    const types = Array.isArray(parsedSchema.type) ? parsedSchema.type : [parsedSchema.type];
    if (!types.some((type) => valueMatchesType(value, type))) return false;
  }
  if (typeof value === 'string') {
    if (parsedSchema.minLength !== undefined && value.length < parsedSchema.minLength) return false;
    if (parsedSchema.maxLength !== undefined && value.length > parsedSchema.maxLength) return false;
    if (parsedSchema.pattern !== undefined && !new RegExp(parsedSchema.pattern).test(value))
      return false;
  }
  if (typeof value === 'number') {
    if (parsedSchema.minimum !== undefined && value < parsedSchema.minimum) return false;
    if (parsedSchema.maximum !== undefined && value > parsedSchema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (parsedSchema.minItems !== undefined && value.length < parsedSchema.minItems) return false;
    if (parsedSchema.maxItems !== undefined && value.length > parsedSchema.maxItems) return false;
    if (
      parsedSchema.uniqueItems &&
      value.some((item, index) => value.slice(0, index).some((other) => valuesEqual(item, other)))
    ) {
      return false;
    }
    if (
      parsedSchema.prefixItems?.some(
        (itemSchema, index) => index < value.length && !valueMatchesSchema(value[index], itemSchema)
      )
    ) {
      return false;
    }
    if (parsedSchema.items === false && value.length > (parsedSchema.prefixItems?.length ?? 0)) {
      return false;
    }
    if (Array.isArray(parsedSchema.items)) {
      if (
        parsedSchema.items.some(
          (itemSchema, index) =>
            index < value.length && !valueMatchesSchema(value[index], itemSchema)
        )
      ) {
        return false;
      }
    } else if (parsedSchema.items && typeof parsedSchema.items === 'object') {
      const startIndex = parsedSchema.prefixItems?.length ?? 0;
      if (
        value
          .slice(startIndex)
          .some((item) => !valueMatchesSchema(item, parsedSchema.items as JsonSchema))
      ) {
        return false;
      }
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    // 旧工具的 required: boolean 表达整个输入必填，由 NodeIO 检查；这里只校验对象字段列表。
    if (
      Array.isArray(parsedSchema.required) &&
      parsedSchema.required.some((key) => record[key] === undefined)
    )
      return false;

    // patternProperties 命中的字段不属于额外字段；多个正则命中时需同时满足，和工具运行时一致。
    const patterns = Object.entries(parsedSchema.patternProperties ?? {}).map(
      ([pattern, schema]) => ({
        pattern: new RegExp(pattern),
        schema
      })
    );
    if (
      Object.entries(record).some(([key, value]) =>
        patterns.some(
          ({ pattern, schema }) => pattern.test(key) && !valueMatchesSchema(value, schema)
        )
      )
    )
      return false;
    const additionalKeys = Object.keys(record).filter(
      (key) => !parsedSchema.properties?.[key] && !patterns.some(({ pattern }) => pattern.test(key))
    );
    if (parsedSchema.additionalProperties === false && additionalKeys.length > 0) return false;
    if (
      parsedSchema.additionalProperties &&
      typeof parsedSchema.additionalProperties === 'object' &&
      additionalKeys.some(
        (key) =>
          !valueMatchesSchema(
            record[key],
            parsedSchema.additionalProperties as Record<string, unknown>
          )
      )
    ) {
      return false;
    }
    if (
      Object.entries(parsedSchema.properties ?? {}).some(
        ([key, itemSchema]) =>
          record[key] !== undefined &&
          !valueMatchesSchema(record[key], itemSchema as Record<string, unknown>)
      )
    ) {
      return false;
    }
  }
  return true;
};

/** 校验节点输入契约提供的 JSON Schema 子集。 */
export const assertValueSchema = ({
  value,
  schema,
  nodeId,
  inputKey
}: {
  value: unknown;
  schema: Record<string, unknown>;
  nodeId: string;
  inputKey: string;
}) => {
  if (!valueMatchesSchema(value, schema)) {
    throw new WorkflowCommandError([
      {
        code: WorkflowDiagnosticCodeEnum.inputValueSchemaInvalid,
        severity: 'error',
        nodeId,
        inputKey
      }
    ]);
  }
};
