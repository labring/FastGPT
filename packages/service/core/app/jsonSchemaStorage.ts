type ToolSetStorageType = 'mcp' | 'http';

const ToolSetConfigKey: Record<ToolSetStorageType, 'mcpToolSet' | 'httpToolSet'> = {
  mcp: 'mcpToolSet',
  http: 'httpToolSet'
};

const JsonSchemaStorageKeys: Record<ToolSetStorageType, ReadonlySet<string>> = {
  mcp: new Set(['inputSchema']),
  http: new Set(['inputSchema', 'outputSchema', 'requestSchema', 'responseSchema', 'secretSchema'])
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const transformToolSetNodes = <T>(
  nodes: T,
  types: readonly ToolSetStorageType[],
  transformSchema: (schema: unknown) => unknown
): T => {
  if (!Array.isArray(nodes)) return nodes;

  let changed = false;

  const transformedNodes = nodes.map((node) => {
    if (!isRecord(node) || !isRecord(node.toolConfig)) return node;

    let transformedNode = node;
    let transformedToolConfig: Record<string, unknown> = node.toolConfig;
    let nodeChanged = false;

    for (const type of types) {
      const toolSetKey = ToolSetConfigKey[type];
      const schemaKeys = JsonSchemaStorageKeys[type];
      const toolSet = transformedToolConfig[toolSetKey];
      if (!isRecord(toolSet) || !Array.isArray(toolSet.toolList)) continue;

      let toolSetChanged = false;
      const toolList = toolSet.toolList.map((tool) => {
        if (!isRecord(tool)) return tool;

        let toolChanged = false;
        const transformedTool = Object.fromEntries(
          Object.entries(tool).map(([key, value]) => {
            if (!schemaKeys.has(key)) return [key, value];

            const transformedValue = transformSchema(value);
            if (transformedValue !== value) {
              toolChanged = true;
              toolSetChanged = true;
              changed = true;
            }
            return [key, transformedValue];
          })
        );

        return toolChanged ? transformedTool : tool;
      });

      if (toolSetChanged) {
        transformedToolConfig = {
          ...transformedToolConfig,
          [toolSetKey]: {
            ...toolSet,
            toolList
          }
        };
        transformedNode = {
          ...transformedNode,
          toolConfig: transformedToolConfig
        };
        nodeChanged = true;
      }
    }

    return nodeChanged ? transformedNode : node;
  });

  return (changed ? transformedNodes : nodes) as T;
};

const encodeSchema = (schema: unknown) =>
  schema && typeof schema === 'object' ? JSON.stringify(schema) : schema;

const decodeSchema = (schema: unknown) => {
  // 历史数据可能仍是 object，读取时保留兼容性，迁移接口负责后续转换。
  if (schema === undefined || schema === null || typeof schema === 'object') return schema;
  if (typeof schema !== 'string') {
    throw new TypeError('Stored tool JSON Schema must be a string');
  }
  return JSON.parse(schema);
};

/** 将 MCP 工具节点中的 JSON Schema 编码为 Mongo 可安全存储的字符串。 */
export const encodeMcpToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, ['mcp'], encodeSchema);

/** 将 HTTP 工具节点中的 JSON Schema 编码为 Mongo 可安全存储的字符串。 */
export const encodeHttpToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, ['http'], encodeSchema);

/** 将工作流中的 MCP/HTTP 工具 JSON Schema 编码为 Mongo 可安全存储的字符串。 */
export const encodeToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, ['mcp', 'http'], encodeSchema);

/** 将 Mongo 中的 MCP 工具 JSON Schema 恢复为运行时对象。 */
export const decodeMcpToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, ['mcp'], decodeSchema);

/** 将 Mongo 中的 HTTP 工具 JSON Schema 恢复为运行时对象。 */
export const decodeHttpToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, ['http'], decodeSchema);

/** 解码工作流中可能存在的 MCP/HTTP 工具节点，普通节点不会被修改。 */
export const decodeToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, ['mcp', 'http'], decodeSchema);

/** 清洗指定工具类型的历史 object JSON Schema，供升级脚本批量写回原始 Mongo 数据。 */
export const cleanToolSetJsonSchemasForStorage = <T>(
  nodes: T,
  type: ToolSetStorageType
): {
  nodes: T;
  changed: boolean;
  convertedSchemaCount: number;
} => {
  let convertedSchemaCount = 0;
  const cleanedNodes = transformToolSetNodes(nodes, [type], (schema) => {
    if (!schema || typeof schema !== 'object') return schema;
    convertedSchemaCount += 1;
    return JSON.stringify(schema);
  });

  return {
    nodes: cleanedNodes,
    changed: convertedSchemaCount > 0,
    convertedSchemaCount
  };
};
