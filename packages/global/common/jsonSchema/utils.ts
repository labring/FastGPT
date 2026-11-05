/**
 * FastGPT 工具 Schema 内部字段，不能透传给模型供应商。
 * 放在全局模块，供普通 completions 与 agent-loop provider 共用。
 */
const toolSchemaPrivateKeys = new Set([
  'toolDescription',
  'x-tool-description',
  'isToolParam',
  'isSecret',
  'x-i18n',
  'x-fastgpt-node-input',
  'x-fastgpt-node-output'
]);

/**
 * 模型请求出口的工具参数归一化：合并旧版 required 布尔标记并移除内部字段。
 * 返回副本，不修改工具原始定义。
 */
export const sanitizeToolParametersForModel = (schema: unknown): unknown =>
  normalizeJsonSchema({ schema, omitKeys: toolSchemaPrivateKeys });

/**
 * 将旧版 property.required 布尔标记合并到父对象的 required 数组，并按需清理内部 Schema 字段。
 * 仅遍历 JSON Schema 的子 Schema 位置，保留业务属性名及 const、enum、default、examples 等数据。
 * 返回转换后的副本，不修改原始 Schema；布尔 Schema 和非对象值原样保留。
 */
export const normalizeJsonSchema = ({
  schema,
  omitKeys
}: {
  schema: unknown;
  omitKeys?: ReadonlySet<string>;
}): unknown => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

  /** 区分 Schema 字典和普通数据，避免误删名为 isSecret、required 等合法业务字段。 */
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!isRecord(value)) return value;

    const normalized = { ...value };
    if (typeof value.required === 'boolean') delete normalized.required;
    const properties = isRecord(value.properties) ? value.properties : {};
    const required = [
      ...(Array.isArray(value.required) ? value.required : []),
      ...Object.entries(properties)
        .filter(([, property]) => isRecord(property) && property.required === true)
        .map(([key]) => key)
    ];
    if (required.length > 0) normalized.required = [...new Set(required)];

    for (const key of [
      'properties',
      'patternProperties',
      '$defs',
      'definitions',
      'dependentSchemas',
      'dependencies'
    ]) {
      const schemas = value[key];
      if (isRecord(schemas)) {
        normalized[key] = Object.fromEntries(
          Object.entries(schemas).map(([name, child]) => [name, normalize(child)])
        );
      }
    }
    for (const key of [
      'items',
      'additionalItems',
      'additionalProperties',
      'unevaluatedItems',
      'unevaluatedProperties',
      'contains',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
      'allOf',
      'anyOf',
      'oneOf',
      'prefixItems',
      'contentSchema'
    ]) {
      if (value[key] !== undefined) normalized[key] = normalize(value[key]);
    }

    return Object.fromEntries(Object.entries(normalized).filter(([key]) => !omitKeys?.has(key)));
  };

  return normalize(schema);
};
