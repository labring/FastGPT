const JsonSchemaStorageKeys = new Set([
  'inputSchema',
  'outputSchema',
  'requestSchema',
  'responseSchema',
  'secretSchema'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const transformNodeValue = (value: unknown, encode: boolean): unknown => {
  // 只转换已知工具 Schema 字段，避免影响工作流中的其他 JSON 配置。
  if (Array.isArray(value)) {
    return value.map((item) => transformNodeValue(item, encode));
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (JsonSchemaStorageKeys.has(key)) {
        if (encode && child && typeof child === 'object') {
          return [key, JSON.stringify(child)];
        }
        if (!encode && typeof child === 'string') {
          try {
            return [key, JSON.parse(child)];
          } catch {
            return [key, child];
          }
        }
      }

      return [key, transformNodeValue(child, encode)];
    })
  );
};

/** 将工作流工具 JSON Schema 编码为 Mongo 可安全存储的字符串。 */
export const encodeWorkflowNodesForStorage = (nodes: unknown): unknown =>
  transformNodeValue(nodes, true);

/** 将 Mongo 中的工具 JSON Schema 字符串恢复为运行时对象，并兼容历史 object 数据。 */
export const decodeWorkflowNodesFromStorage = (nodes: unknown): unknown =>
  transformNodeValue(nodes, false);
