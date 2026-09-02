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

type NodeTransformResult = {
  node: Record<string, unknown>;
  changed: boolean;
};

type TransformToolSetNodesProps = {
  nodes: unknown;
  types: readonly ToolSetStorageType[];
  transformSchema: (schema: unknown) => unknown;
  transformNode?: (node: Record<string, unknown>) => NodeTransformResult;
};

const transformToolSetNodes = <T>({
  nodes,
  types,
  transformSchema,
  transformNode
}: TransformToolSetNodesProps): T => {
  if (!Array.isArray(nodes)) return nodes as T;

  let changed = false;

  const transformedNodes = nodes.map((node) => {
    if (!isRecord(node)) return node;

    const transformedNodeResult = transformNode?.(node);
    let transformedNode = transformedNodeResult?.node ?? node;
    let nodeChanged = transformedNodeResult?.changed ?? false;
    changed ||= nodeChanged;
    if (!isRecord(transformedNode.toolConfig)) return nodeChanged ? transformedNode : node;

    let transformedToolConfig: Record<string, unknown> = transformedNode.toolConfig;

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
  // Keep historical object values readable; the migration endpoint can convert them later.
  if (schema === undefined || schema === null || typeof schema === 'object') return schema;
  if (typeof schema !== 'string') {
    throw new TypeError('Stored tool JSON Schema must be a string');
  }
  return JSON.parse(schema);
};

/** Encode MCP tool JSON Schemas as strings for MongoDB storage. */
export const encodeMcpToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({ nodes, types: ['mcp'], transformSchema: encodeSchema });

/** Encode HTTP tool JSON Schemas as strings for MongoDB storage. */
export const encodeHttpToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({ nodes, types: ['http'], transformSchema: encodeSchema });

/** Encode MCP/HTTP workflow tool JSON Schemas as MongoDB-safe strings. */
export const encodeToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({ nodes, types: ['mcp', 'http'], transformSchema: encodeSchema });

const isToolSetReference = (value: unknown): value is { toolId: string } =>
  isRecord(value) && typeof value.toolId === 'string';

/** Resolve a parent toolset ID from a persisted MCP or HTTP child tool ID. */
const getToolSetIdFromToolConfig = (
  toolConfig: Record<string, unknown>,
  type: ToolSetStorageType
) => {
  const config = toolConfig[`${type}Tool`];
  const prefix = `${type}-`;
  if (!isRecord(config) || typeof config.toolId !== 'string') return undefined;

  const toolId = config.toolId;
  if (!toolId.startsWith(prefix)) return undefined;

  const [toolSetId, toolName] = toolId.slice(prefix.length).split('/');
  return toolSetId && toolName ? toolSetId : undefined;
};

const normalizeToolConfigForStorage = (
  toolConfig: Record<string, unknown> | undefined,
  toolId: string | undefined
) => {
  if (!toolConfig) return { toolConfig, changed: false, isMcpOrHttp: false };

  let normalizedToolConfig = toolConfig;
  let changed = false;
  let isMcpOrHttp = false;

  for (const [key, config] of [
    ['mcpTool', toolConfig.mcpTool],
    ['httpTool', toolConfig.httpTool]
  ] as const) {
    if (!isRecord(config)) continue;
    isMcpOrHttp = true;
    if (!isToolSetReference(config)) continue;

    if (Object.keys(config).length !== 1) {
      normalizedToolConfig = {
        ...normalizedToolConfig,
        [key]: { toolId: config.toolId }
      };
      changed = true;
    }
  }

  for (const [key, config] of [
    ['mcpToolSet', toolConfig.mcpToolSet],
    ['httpToolSet', toolConfig.httpToolSet]
  ] as const) {
    if (!isRecord(config)) continue;
    isMcpOrHttp = true;

    const referenceId = isToolSetReference(config)
      ? config.toolId
      : (getToolSetIdFromToolConfig(toolConfig, key === 'mcpToolSet' ? 'mcp' : 'http') ?? toolId);
    if (!referenceId || (isToolSetReference(config) && Object.keys(config).length === 1)) {
      continue;
    }

    normalizedToolConfig = {
      ...normalizedToolConfig,
      [key]: { toolId: referenceId }
    };
    changed = true;
  }

  return {
    toolConfig: normalizedToolConfig,
    changed,
    isMcpOrHttp
  };
};

const compactToolSetNode = (node: Record<string, unknown>): NodeTransformResult => {
  const normalized = normalizeToolConfigForStorage(
    isRecord(node.toolConfig) ? node.toolConfig : undefined,
    typeof node.pluginId === 'string' ? node.pluginId : undefined
  );
  let compactedNode = node;
  let changed = false;

  if (normalized.changed) {
    compactedNode = {
      ...compactedNode,
      toolConfig: normalized.toolConfig
    };
    changed = true;
  }

  if (normalized.isMcpOrHttp && Object.prototype.hasOwnProperty.call(compactedNode, 'version')) {
    const { version: _version, ...rest } = compactedNode;
    compactedNode = rest;
    changed = true;
  }

  const inputs = Array.isArray(compactedNode.inputs) ? compactedNode.inputs : undefined;
  const selectedToolsInput = inputs?.find(
    (input) => isRecord(input) && input.key === 'selectedTools'
  );
  if (selectedToolsInput && Array.isArray(selectedToolsInput.value)) {
    let selectedToolsChanged = false;
    const selectedTools = selectedToolsInput.value.map((tool: unknown) => {
      if (!isRecord(tool)) return tool;

      const toolId =
        typeof tool.pluginId === 'string'
          ? tool.pluginId
          : typeof tool.id === 'string'
            ? tool.id
            : undefined;
      const normalizedTool = normalizeToolConfigForStorage(
        isRecord(tool.toolConfig) ? tool.toolConfig : undefined,
        toolId
      );
      const shouldRemoveVersion =
        normalizedTool.isMcpOrHttp && Object.prototype.hasOwnProperty.call(tool, 'version');
      if (!normalizedTool.changed && !shouldRemoveVersion) return tool;

      const nextTool: Record<string, unknown> = {
        ...tool,
        ...(normalizedTool.changed ? { toolConfig: normalizedTool.toolConfig } : {})
      };
      if (shouldRemoveVersion) {
        delete nextTool.version;
      }
      selectedToolsChanged = true;
      return nextTool;
    });

    if (selectedToolsChanged) {
      compactedNode = {
        ...compactedNode,
        inputs: inputs!.map((input) =>
          input === selectedToolsInput ? { ...input, value: selectedTools } : input
        )
      };
      changed = true;
    }
  }

  return { node: compactedNode, changed };
};

/** Reduce MCP/HTTP workflow references to IDs and remove their obsolete versions. */
export const compactToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({
    nodes,
    types: [],
    transformSchema: (schema) => schema,
    transformNode: compactToolSetNode
  });

/** Compact workflow references and encode MCP/HTTP schemas in one node traversal. */
export const compactAndEncodeToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({
    nodes,
    types: ['mcp', 'http'],
    transformSchema: encodeSchema,
    transformNode: compactToolSetNode
  });

/** Decode MCP tool JSON Schemas from MongoDB storage for runtime use. */
export const decodeMcpToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({ nodes, types: ['mcp'], transformSchema: decodeSchema });

/** Decode HTTP tool JSON Schemas from MongoDB storage for runtime use. */
export const decodeHttpToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({ nodes, types: ['http'], transformSchema: decodeSchema });

/** Decode MCP/HTTP tool schemas without modifying unrelated workflow nodes. */
export const decodeToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes<T>({ nodes, types: ['mcp', 'http'], transformSchema: decodeSchema });

/** Convert historical object schemas for migration scripts that write to raw MongoDB data. */
export const cleanToolSetJsonSchemasForStorage = <T>(
  nodes: T,
  type: ToolSetStorageType
): {
  nodes: T;
  changed: boolean;
  convertedSchemaCount: number;
} => {
  let convertedSchemaCount = 0;
  const cleanedNodes = transformToolSetNodes<T>({
    nodes,
    types: [type],
    transformSchema: (schema) => {
      if (!schema || typeof schema !== 'object') return schema;
      convertedSchemaCount += 1;
      return JSON.stringify(schema);
    }
  });

  return {
    nodes: cleanedNodes,
    changed: convertedSchemaCount > 0,
    convertedSchemaCount
  };
};
