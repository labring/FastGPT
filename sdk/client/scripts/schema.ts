import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

export type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  properties?: Record<string, JsonSchema | boolean>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema | boolean | Array<JsonSchema | boolean>;
  prefixItems?: Array<JsonSchema | boolean>;
  not?: JsonSchema | boolean;
};

/** JSON 契约到公开类型的确定性投影；保留联合分支必填关系，未知业务数据使用 unknown。 */
export const renderType = (
  schema: JsonSchema | boolean,
  root: JsonSchema | boolean = schema
): string => {
  if (typeof schema === 'boolean') return schema ? 'unknown' : 'never';
  if (schema.$ref) {
    const key = schema.$ref.split('/').at(-1)!;
    const target = typeof root === 'object' ? root.$defs?.[key] : undefined;
    if (!target) throw new Error(`Unresolved schema reference: ${schema.$ref}`);
    return renderType(target, root);
  }
  if ('const' in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((item) => JSON.stringify(item)).join(' | ');
  const union = schema.anyOf ?? schema.oneOf;
  if (union) {
    const { anyOf: _any, oneOf: _one, ...base } = schema;
    if (!schema.properties) return union.map((item) => `(${renderType(item, root)})`).join(' | ');
    const alternativeKeys = new Set(union.flatMap((item) => item.required ?? []));
    return union
      .map((item) => {
        const properties = { ...base.properties, ...item.properties };
        // requiredAlternatives(..., true) 表示身份互斥，未选中的身份不能同时提交。
        if (schema.oneOf && union.every((branch) => branch.required?.length === 1)) {
          for (const key of alternativeKeys) {
            if (!item.required?.includes(key)) properties[key] = { not: {} };
          }
        }
        return `(${renderType({ ...base, ...item, properties, required: [...new Set([...(base.required ?? []), ...(item.required ?? [])])] }, root)})`;
      })
      .join(' | ');
  }
  if (schema.allOf) {
    const { allOf, ...base } = schema;
    return [...(base.properties ? [base] : []), ...allOf]
      .map((item) => `(${renderType(item, root)})`)
      .join(' & ');
  }
  if (
    schema.not === true ||
    (typeof schema.not === 'object' && Object.keys(schema.not).length === 0)
  )
    return 'never';
  if (Array.isArray(schema.type))
    return schema.type.map((type) => renderType({ ...schema, type }, root)).join(' | ');
  if (schema.type === 'array') {
    const tuple = schema.prefixItems ?? (Array.isArray(schema.items) ? schema.items : undefined);
    if (tuple) return `[${tuple.map((item) => renderType(item, root)).join(', ')}]`;
    return `Array<${renderType(Array.isArray(schema.items) ? {} : (schema.items ?? {}), root)}>`;
  }
  if (schema.type === 'object' || schema.properties) {
    const fields = Object.entries(schema.properties ?? {}).map(
      ([key, value]) =>
        `${JSON.stringify(key)}${schema.required?.includes(key) ? '' : '?'}: ${renderType(value, root)};`
    );
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
      fields.push(`[key: string]: ${renderType(schema.additionalProperties, root)};`);
    else if (schema.additionalProperties === true) fields.push('[key: string]: unknown;');
    return fields.length ? `{ ${fields.join(' ')} }` : 'Record<string, unknown>';
  }
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'string' || schema.type === 'boolean' || schema.type === 'null')
    return schema.type;
  return 'unknown';
};

/** 复用项目 OpenAPI 元数据回调；修正 ObjectId preprocess 和 HTTP 日期的表示。 */
export const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') =>
  z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema: output }) => {
      const metadata = z.globalRegistry.get(zodSchema);
      const override = metadata?.override;
      if (typeof override === 'function')
        Reflect.apply(override, undefined, [{ jsonSchema: output, zodSchema, io }]);
      else if (override && typeof override === 'object') Object.assign(output, override);
      delete output.override;
      if (zodSchema instanceof z.ZodPipe && zodSchema.out === ObjectIdSchema.out)
        Object.assign(output, { type: 'string', pattern: '^[0-9a-fA-F]{24}$' });
      if (zodSchema instanceof z.ZodDate)
        Object.assign(output, { type: 'string', format: 'date-time' });
    }
  });
