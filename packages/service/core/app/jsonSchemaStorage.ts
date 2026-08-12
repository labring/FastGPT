const JsonSchemaStorageKeys = new Set([
  'inputSchema',
  'outputSchema',
  'requestSchema',
  'responseSchema',
  'secretSchema'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const transformNodeValue = (
  value: unknown,
  transformSchema: (schema: unknown) => unknown
): unknown => {
  // 只转换已知工具 Schema 字段，避免影响工作流中的其他 JSON 配置。
  if (Array.isArray(value)) {
    return value.map((item) => transformNodeValue(item, transformSchema));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (JsonSchemaStorageKeys.has(key)) {
        return [key, transformSchema(child)];
      }

      return [key, transformNodeValue(child, transformSchema)];
    })
  );
};

/** 将工作流工具 JSON Schema 编码为 Mongo 可安全存储的字符串。 */
export const encodeWorkflowNodesForStorage = (nodes: unknown): unknown =>
  transformNodeValue(nodes, (schema) =>
    schema && typeof schema === 'object' ? JSON.stringify(schema) : schema
  );

/** 将 Mongo 中的工具 JSON Schema 字符串恢复为运行时对象。 */
export const decodeWorkflowNodesFromStorage = (nodes: unknown): unknown =>
  transformNodeValue(nodes, (schema) => {
    if (schema === undefined || schema === null) return schema;
    if (typeof schema !== 'string') {
      throw new TypeError('Stored tool JSON Schema must be a string');
    }
    return JSON.parse(schema);
  });

/**
 * 将历史工作流中的 object JSON Schema 清洗为字符串，供升级脚本批量写回原始 Mongo 数据。
 * 已经是字符串的数据保持不变，未发生转换时保留原 nodes 引用。
 * 升级脚本需要通过 Model.collection 读取原始文档，避免触发严格的运行时解码。
 */
export const cleanWorkflowToolJsonSchemasForStorage = (
  nodes: unknown
): {
  nodes: unknown;
  changed: boolean;
  convertedSchemaCount: number;
} => {
  let convertedSchemaCount = 0;
  const cleanedNodes = transformNodeValue(nodes, (schema) => {
    if (!schema || typeof schema !== 'object') return schema;

    convertedSchemaCount += 1;
    return JSON.stringify(schema);
  });

  return {
    nodes: convertedSchemaCount > 0 ? cleanedNodes : nodes,
    changed: convertedSchemaCount > 0,
    convertedSchemaCount
  };
};
