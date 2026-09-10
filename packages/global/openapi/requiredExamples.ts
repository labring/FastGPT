import { createSchema, type oas31 } from 'zod-openapi';
import type { OpenAPIPath } from './type';
import type { z } from 'zod';

/** 生成最小请求体与参数示例；从原始参数 Schema 保留组合选择，完整约束和响应示例不变。 */
export const setRequiredRequestExamples = (
  document: oas31.OpenAPIObject,
  sourcePaths?: OpenAPIPath
) => {
  /** 只解析文档内引用；循环引用在当前递归分支终止，避免生成无限嵌套的示例。 */
  const resolve = <T extends object>(value: T | oas31.ReferenceObject): T => {
    if (!('$ref' in value)) return value as T;
    if (!value.$ref.startsWith('#/')) return {} as T;
    return value.$ref
      .slice(2)
      .split('/')
      .reduce<unknown>((current, key) => {
        const decoded = key.replace(/~1/g, '/').replace(/~0/g, '~');
        return current && typeof current === 'object' ? Reflect.get(current, decoded) : undefined;
      }, document) as T;
  };

  /** 先合并组合约束，再按 required 递归取值；oneOf/anyOf 仅使用第一个分支。 */
  const sample = (
    input: oas31.SchemaObject | oas31.ReferenceObject,
    seed?: unknown,
    ancestors = new Set<object>()
  ): unknown => {
    const schema = resolve<oas31.SchemaObject>(input);
    if (!schema || ancestors.has(schema)) return undefined;
    const next = new Set(ancestors).add(schema);
    const branches =
      schema.allOf ?? (schema.oneOf?.[0] ? [schema.oneOf[0]] : schema.anyOf?.slice(0, 1));
    if (branches?.length) {
      const { allOf, oneOf, anyOf, ...base } = schema;
      const merged = branches.reduce<oas31.SchemaObject>((result, branch) => {
        const item = resolve<oas31.SchemaObject>(branch);
        return {
          ...result,
          ...item,
          ...((result.properties || item?.properties) && {
            properties: { ...result.properties, ...item?.properties }
          }),
          required: [...new Set([...(result.required ?? []), ...(item?.required ?? [])])]
        };
      }, base);
      return sample(merged, seed, next);
    }
    const value = seed ?? schema.example ?? schema.examples?.[0] ?? schema.default;
    if (schema.type === 'object' || schema.properties) {
      return Object.fromEntries(
        (schema.required ?? []).flatMap((key) => {
          const property = schema.properties?.[key];
          if (!property) return [];
          const resolvedProperty = resolve<oas31.SchemaObject>(property);
          // Zod preprocess 包装的默认值可能仍被导出为 required，调用时可省略这些字段。
          if (resolvedProperty?.readOnly || resolvedProperty?.default !== undefined) return [];
          const child = sample(
            property,
            value && typeof value === 'object' ? Reflect.get(value, key) : undefined,
            next
          );
          return child === undefined ? [] : [[key, child]];
        })
      );
    }
    if (schema.type === 'array') {
      if (!schema.items) return [];
      const values = Array.isArray(value) ? value : [];
      return Array.from(
        { length: Math.max(schema.minItems ?? 0, values.length || 1) },
        (_, index) => sample(schema.items!, values[index], next)
      ).filter((item) => item !== undefined);
    }
    if (schema.const !== undefined) return schema.const;
    if (schema.enum?.length) return schema.enum[0];
    if (value !== undefined) return value;
    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (type === 'null') return null;
    if (type === 'boolean') return false;
    if (type === 'integer' || type === 'number') return schema.minimum ?? 0;
    return 'string'.padEnd(schema.minLength ?? 0, 'x');
  };

  for (const [url, path] of Object.entries(document.paths ?? {})) {
    if (!path) continue;
    for (const method of [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'options',
      'head',
      'trace'
    ] as const) {
      const operation = path[method];
      if (!operation) continue;
      // OpenAPI parameters 是平铺字段，跨字段约束需从原始 Query/Header 对象保留。
      const source = sourcePaths?.[url]?.[method];
      const selected = new Set<string>();
      for (const location of ['query', 'header', 'path', 'cookie'] as const) {
        const input = source?.requestParams?.[location];
        if (!input || !('_zod' in input)) continue;
        const generated = createSchema(input as z.ZodType, { io: 'input' });
        // 只取组合分支选中的字段；普通必填字段仍由 parameter.required 控制。
        const seen = new Set<object>();
        const collect = (input?: oas31.SchemaObject | oas31.ReferenceObject) => {
          if (!input || seen.has(input)) return;
          seen.add(input);
          if (typeof input.$ref === 'string') {
            const key = input.$ref.split('/').at(-1)!.replace(/~1/g, '/').replace(/~0/g, '~');
            collect(generated.components[key]);
            return;
          }
          const schema = input as oas31.SchemaObject;
          for (const key of schema.required ?? []) selected.add(`${location}:${key}`);
          for (const child of schema.allOf ?? []) collect(child);
          collect(schema.oneOf?.[0]);
          collect(schema.anyOf?.[0]);
        };
        collect(generated.schema);
      }
      // Query/Header/Body 跨位置约束无法用单个 JSON Schema 表达，使用 operation 扩展描述。
      const alternatives = operation['x-required-parameter-alternatives'] as
        | { in: string; name: string }[][]
        | undefined;
      for (const field of alternatives?.[0] ?? []) selected.add(`${field.in}:${field.name}`);
      for (const input of [...(path.parameters ?? []), ...(operation.parameters ?? [])]) {
        const parameter = resolve<oas31.ParameterObject>(input);
        if (!parameter) continue;
        const enabled =
          parameter.required === true || selected.has(`${parameter.in}:${parameter.name}`);
        const first = Object.values(parameter.examples ?? {})[0];
        const seed = first ? resolve<oas31.ExampleObject>(first)?.value : parameter.example;
        parameter.examples = {
          default: {
            value: parameter.schema ? sample(parameter.schema, seed) : seed,
            'x-disabled': !enabled
          }
        };
        delete parameter.example;
      }
      if (!operation.requestBody) continue;
      const body = resolve<oas31.RequestBodyObject>(operation.requestBody);
      for (const media of Object.values(body?.content ?? {})) {
        if (!media.schema) continue;
        const firstExample = Object.values(media.examples ?? {})[0];
        const seed = firstExample
          ? resolve<oas31.ExampleObject>(firstExample)?.value
          : media.example;
        const bodyFields = [...selected]
          .filter((field) => field.startsWith('body:'))
          .map((field) => field.slice(5));
        media.example = sample(
          bodyFields.length ? { allOf: [media.schema, { required: bodyFields }] } : media.schema,
          seed
        );
        delete media.examples;
      }
    }
  }
  return document;
};
