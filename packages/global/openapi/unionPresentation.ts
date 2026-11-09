import type { z } from 'zod';
import type { oas31 } from 'zod-openapi';

type Schema = z.core.JSONSchema.JSONSchema;
type Property = boolean | Schema;
type ObjectView = {
  properties: Record<string, Property>;
  required: Set<string>;
  owned: Set<string>;
  object: boolean;
  extractable: boolean;
};

/**
 * 为已生成的文档统一投影对象 union：自动识别分支差异、前置对应参数，并按声明的配套字段组高亮。
 * 不修改源文档、运行时 Schema 或 HTTP 层级；引用及闭合对象保留原有约束，不可安全提取时就地排序。
 * 只遍历 Schema 位置，不处理 example/default 等用户数据；值类型 union 保留原生类型选择。
 */
export const prepareOpenApiUnionPresentation = (document: oas31.OpenAPIObject) => {
  const isSchema = (value: unknown): value is Schema =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const normalized = new WeakMap<Schema, Schema>();
  const owners = new WeakMap<Schema, Set<string>>();
  const views = new WeakMap<Schema, ObjectView>();

  /** 仅解析文档内部引用；递归模型在当前分析路径终止，保留其原始引用。 */
  const resolve = (schema: Schema, active = new Set<Schema>()): Schema | undefined => {
    if (!schema.$ref) return schema;
    if (!schema.$ref.startsWith('#/') || active.has(schema)) return;
    const target = schema.$ref
      .slice(2)
      .split('/')
      .reduce<unknown>((value, key) => {
        const decoded = key.replace(/~1/g, '/').replace(/~0/g, '~');
        return isSchema(value) ? value[decoded] : undefined;
      }, document);
    if (!isSchema(target)) return;
    const next = new Set(active).add(schema);
    const resolved = resolve(target, next);
    if (!resolved) return;
    const { $ref, ...siblings } = schema;
    return Object.keys(siblings).length ? { allOf: [resolved, siblings] } : resolved;
  };

  /** 比较约束而非文案、字段顺序或本次展示包装；必填差异在外层单独比较。 */
  const signature = (value: unknown): string => {
    const canonical = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonical);
      if (!isSchema(value)) return value;
      if (value['x-fastgpt-union-parameter'] && value.allOf?.length === 1)
        return canonical(value.allOf[0]);
      return Object.fromEntries(
        Object.keys(value)
          .filter(
            (key) =>
              !key.startsWith('x-fastgpt-') &&
              !['title', 'description', 'example', 'examples'].includes(key)
          )
          .sort()
          .map((key) => [key, canonical(value[key])])
      );
    };
    return JSON.stringify(canonical(value));
  };

  /** 汇总同一对象层级的字段；属性值中的 union 属于下一层，不抢占当前层的参数。 */
  const inspect = (input: Schema, active = new Set<Schema>()): ObjectView => {
    const cached = views.get(input);
    if (cached) return cached;
    const empty = (): ObjectView => ({
      properties: {},
      required: new Set(),
      owned: new Set(),
      object: false,
      extractable: false
    });
    if (active.has(input)) return empty();
    const schema = resolve(input);
    if (!schema) return empty();
    const next = new Set(active).add(input);
    const result: ObjectView = {
      properties: { ...schema.properties },
      required: new Set(schema.required),
      owned: new Set(owners.get(input)),
      object: schema.type === 'object' || !!schema.properties,
      extractable:
        (schema.additionalProperties === undefined || schema.additionalProperties === true) &&
        schema.unevaluatedProperties !== false
    };
    for (const part of schema.allOf ?? []) {
      const view = inspect(part, next);
      for (const [key, value] of Object.entries(view.properties)) {
        const current = result.properties[key];
        result.properties[key] =
          current !== undefined && signature(current) !== signature(value)
            ? {
                allOf: [
                  current === true ? {} : current === false ? { not: {} } : current,
                  value === true ? {} : value === false ? { not: {} } : value
                ]
              }
            : value;
      }
      view.required.forEach((key) => result.required.add(key));
      view.owned.forEach((key) => result.owned.add(key));
      result.object ||= view.object;
      result.extractable &&= view.extractable;
    }
    for (const keyword of ['anyOf', 'oneOf'] as const) {
      const choices = schema[keyword];
      if (!choices?.length) continue;
      const variants = choices.map((choice) => inspect(choice, next));
      if (!variants.every((view) => view.object)) continue;
      const common = Object.keys(variants[0].properties).filter((key) =>
        variants.every((view) => key in view.properties)
      );
      for (const key of new Set(variants.flatMap((view) => Object.keys(view.properties)))) {
        if (
          variants.some(
            (view) =>
              signature(view.properties[key]) !== signature(variants[0].properties[key]) ||
              view.required.has(key) !== variants[0].required.has(key)
          )
        )
          result.owned.add(key);
      }
      const groups = new Set(
        variants.flatMap((view) =>
          [...result.owned].map((key) => groupOf(view.properties[key])?.id).filter(Boolean)
        )
      );
      variants.forEach((view) =>
        Object.entries(view.properties).forEach(([key, value]) => {
          if (groups.has(groupOf(value)?.id)) result.owned.add(key);
        })
      );
      for (const key of common) {
        result.properties[key] ??= variants[0].properties[key];
        if (variants.every((view) => view.required.has(key))) result.required.add(key);
      }
      variants.forEach((view) => view.owned.forEach((key) => result.owned.add(key)));
      result.object = true;
      result.extractable &&= variants.every((view) => view.extractable);
    }
    views.set(input, result);
    return result;
  };

  const groupOf = (property: Property): { id: string; label: string } | undefined => {
    if (!isSchema(property)) return;
    const group = property['x-fastgpt-union-group'];
    if (isSchema(group) && typeof group.id === 'string' && typeof group.label === 'string')
      return { id: group.id, label: group.label };
    for (const part of property.allOf ?? []) {
      const group = groupOf(part);
      if (group) return group;
    }
  };

  /** 一组字段仍是多个平铺参数；用展示位置标记把相邻原生字段连成一张卡片。 */
  const cards = (properties: Record<string, Property>, fields: Set<string>, primary = fields) => {
    const result: Record<string, Property> = {};
    const added = new Set<string>();
    for (const key of Object.keys(properties)) {
      if (!fields.has(key) || added.has(key) || properties[key] === false) continue;
      const group = groupOf(properties[key]);
      const members = (
        group
          ? Object.keys(properties).filter((name) => groupOf(properties[name])?.id === group.id)
          : Object.keys(properties).filter((name) => fields.has(name) && !groupOf(properties[name]))
      )
        .filter((name) => properties[name] !== false)
        .sort((a, b) => Number(primary.has(b)) - Number(primary.has(a)));
      for (const [index, name] of members.entries()) {
        added.add(name);
        const property = properties[name];
        const bare = isSchema(property) ? property : {};
        const wrapper = bare['x-fastgpt-union-parameter'] ? { ...bare } : { allOf: [bare] };
        result[name] = {
          ...wrapper,
          'x-fastgpt-union-parameter': {
            label: group?.label ?? '',
            position:
              members.length === 1
                ? 'only'
                : index === 0
                  ? 'first'
                  : index === members.length - 1
                    ? 'last'
                    : 'middle'
          }
        };
      }
    }
    return result;
  };

  /** 提取只跨过开放对象和正向组合；闭合对象只在本地标记，避免改变 additionalProperties 的含义。 */
  const removeFields = (schema: Schema, fields: Set<string>): Schema => {
    const resolved = resolve(schema);
    if (!resolved) return schema;
    const result = { ...resolved };
    if (result.properties)
      result.properties = Object.fromEntries(
        Object.entries(result.properties).filter(([key]) => !fields.has(key))
      );
    if (result.required) result.required = result.required.filter((key) => !fields.has(key));
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const)
      if (result[keyword])
        result[keyword] = result[keyword].map((part) => removeFields(part, fields));
    owners.set(result, new Set(owners.get(schema)));
    return result;
  };

  /** 闭合约束不能跨层提取时，保留字段定义与校验，仅在其原生对象中排序和高亮。 */
  const decorateInPlace = (schema: Schema, fields: Set<string>, primary: Set<string>): Schema => {
    const result = { ...schema };
    if (result.properties) {
      const highlighted = cards(result.properties, fields, primary);
      result.properties = {
        ...highlighted,
        ...Object.fromEntries(
          Object.entries(result.properties).filter(([key]) => !(key in highlighted))
        )
      };
    }
    for (const key of ['allOf', 'anyOf', 'oneOf'] as const)
      if (result[key])
        result[key] = result[key].map((part) => decorateInPlace(part, fields, primary));
    owners.set(result, new Set(owners.get(schema)));
    return result;
  };

  const normalizeSchema = (input: Schema): Schema => {
    const previous = normalized.get(input);
    if (previous) return previous;
    const schema = { ...input };
    normalized.set(input, schema);
    normalized.set(schema, schema);
    for (const key of ['properties', 'patternProperties', '$defs', 'dependentSchemas'] as const) {
      if (schema[key])
        Reflect.set(
          schema,
          key,
          Object.fromEntries(
            Object.entries(schema[key]).map(([name, value]) => [
              name,
              isSchema(value) ? normalizeSchema(value) : value
            ])
          )
        );
    }
    for (const key of [
      'items',
      'additionalProperties',
      'unevaluatedProperties',
      'not',
      'if',
      'then',
      'else',
      'contains',
      'propertyNames'
    ] as const) {
      if (isSchema(schema[key])) schema[key] = normalizeSchema(schema[key]);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const)
      if (schema[key])
        Reflect.set(
          schema,
          key,
          schema[key].map((item) => (isSchema(item) ? normalizeSchema(item) : item))
        );

    for (const keyword of ['anyOf', 'oneOf'] as const) {
      let choices = schema[keyword];
      if (!choices || choices.length < 2) continue;
      // 开放对象的公共字段可分配给各分支；避免 Scalar 把它们固定排在差异字段之前。
      const requiredOnly = choices.every((choice) => {
        const branch = resolve(choice);
        return (
          branch &&
          Object.keys(branch).every(
            (key) => ['required', 'title', 'description'].includes(key) || key.startsWith('x-')
          )
        );
      });
      if (
        schema.properties &&
        ((schema.additionalProperties === undefined && schema.unevaluatedProperties !== false) ||
          (requiredOnly && !schema.patternProperties)) &&
        choices.every((choice) => {
          const resolved = resolve(choice);
          return (
            resolved &&
            (resolved.properties || requiredOnly) &&
            !resolved.anyOf &&
            !resolved.oneOf &&
            !resolved.allOf &&
            inspect(choice).extractable
          );
        })
      ) {
        const common = schema.properties;
        const required = schema.required ?? [];
        choices = choices.map((choice) => {
          const branch = resolve(choice)!;
          const properties = { ...common, ...branch.properties };
          for (const [key, property] of Object.entries(branch.properties ?? {})) {
            const base = common[key];
            if (base !== undefined && signature(base) !== signature(property))
              properties[key] = {
                allOf: [
                  base === true ? {} : base === false ? { not: {} } : base,
                  property === true ? {} : property === false ? { not: {} } : property
                ]
              };
          }
          return {
            ...branch,
            properties,
            ...(requiredOnly && schema.additionalProperties !== undefined
              ? { additionalProperties: schema.additionalProperties }
              : {}),
            required: [...new Set([...required, ...(branch.required ?? [])])]
          };
        });
        delete schema.properties;
        delete schema.required;
        if (requiredOnly) delete schema.additionalProperties;
      }
      const variants = choices.map((choice) => inspect(choice));
      if (!variants.every((view) => view.object)) continue;
      const nested = new Set(variants.flatMap((view) => [...view.owned]));
      const fields = new Set(
        [...new Set(variants.flatMap((view) => Object.keys(view.properties)))].filter(
          (key) =>
            !nested.has(key) &&
            variants.some(
              (view) =>
                signature(view.properties[key]) !== signature(variants[0].properties[key]) ||
                view.required.has(key) !== variants[0].required.has(key)
            )
        )
      );
      const primary = new Set(fields);
      // 配套字段不是差异字段，通过同组声明随当前方式一起前置。
      const groups = new Set(
        variants.flatMap((view) =>
          [...fields].map((key) => groupOf(view.properties[key])?.id).filter(Boolean)
        )
      );
      variants.forEach((view) =>
        Object.entries(view.properties).forEach(([key, value]) => {
          if (groups.has(groupOf(value)?.id)) fields.add(key);
        })
      );
      owners.set(schema, new Set([...nested, ...fields]));
      if (!fields.size) continue;
      schema[keyword] = choices.map((choice, index) => {
        const resolved = resolve(choice);
        if (!resolved) return choice;
        const branch = normalizeSchema(resolved);
        const view = variants[index];
        // 仅必填条件不同的共用字段，在要求它的分支中突出；可选分支仍按公共字段展示。
        const active = new Set(
          [...fields].filter((key) => {
            const identical = variants.every(
              (variant) =>
                key in variant.properties &&
                signature(variant.properties[key]) === signature(view.properties[key])
            );
            return !primary.has(key) || !identical || view.required.has(key);
          })
        );
        const highlighted = cards(view.properties, active, primary);
        if (!Object.keys(highlighted).length) return branch;
        const direct = Object.keys(highlighted).every((key) => key in (branch.properties ?? {}));
        if (direct) {
          const result = {
            ...branch,
            ...(branch.allOf?.length ? { 'x-fastgpt-union-layout': true } : {}),
            title:
              branch.title ??
              (requiredOnly
                ? `提供 ${[...active].filter((key) => view.required.has(key)).join('、')}`
                : undefined),
            description: branch.description ?? '',
            properties: {
              ...highlighted,
              ...Object.fromEntries(
                Object.entries(branch.properties ?? {}).filter(([key]) => !(key in highlighted))
              )
            }
          };
          owners.set(result, new Set(view.owned));
          return result;
        }
        if (!view.extractable) return decorateInPlace(branch, fields, primary);
        const rest = removeFields(branch, new Set(Object.keys(highlighted)));
        delete rest.title;
        delete rest.description;
        const result = {
          title: branch.title,
          description: branch.description ?? '',
          properties: highlighted,
          required: [...view.required].filter((key) => key in highlighted),
          // 保留两项防止 Scalar 把独立参数块合并回内部选择器。
          allOf: [rest, {}],
          'x-fastgpt-union-layout': true
        };
        owners.set(result, new Set(view.owned));
        return result;
      });
    }
    return schema;
  };

  /** 遍历 OpenAPI 的 Schema 容器；原始示例和扩展数据逐字保留。 */
  const walkDocument = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walkDocument);
    if (!isSchema(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (['example', 'examples', 'default'].includes(key) || key.startsWith('x-'))
          return [key, item];
        if (key === 'schema' && isSchema(item)) return [key, normalizeSchema(item)];
        if (key === 'schemas' && isSchema(item))
          return [
            key,
            Object.fromEntries(
              Object.entries(item).map(([name, schema]) => [
                name,
                isSchema(schema) ? normalizeSchema(schema) : schema
              ])
            )
          ];
        return [key, walkDocument(item)];
      })
    );
  };
  // 非 Schema 字段结构保持不变，Schema 投影仍遵循标准 OpenAPI 结构。
  return walkDocument(document) as oas31.OpenAPIObject;
};
