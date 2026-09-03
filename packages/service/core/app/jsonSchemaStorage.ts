import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeToolConfigStorageTypeSchema } from '@fastgpt/global/core/workflow/type/node';

export type ToolSetStorageType = 'mcp' | 'http';

const ToolSetConfigKey: Record<ToolSetStorageType, 'mcpToolSet' | 'httpToolSet'> = {
  mcp: 'mcpToolSet',
  http: 'httpToolSet'
};

const JsonSchemaStorageKeys: Record<ToolSetStorageType, ReadonlySet<string>> = {
  mcp: new Set(['inputSchema']),
  http: new Set(['inputSchema', 'outputSchema', 'requestSchema', 'responseSchema', 'secretSchema'])
};

/** Check whether a value is a non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Transform only JSON Schema fields inside a standalone toolset node. */
const transformToolSetNodes = <T>(
  nodes: T,
  type: ToolSetStorageType,
  transformSchema: (schema: unknown) => unknown
): T => {
  if (!Array.isArray(nodes)) return nodes;

  const toolSetKey = ToolSetConfigKey[type];
  const schemaKeys = JsonSchemaStorageKeys[type];
  let changed = false;

  const transformedNodes = nodes.map((node) => {
    if (!isRecord(node) || !isRecord(node.toolConfig)) return node;

    const toolSet = node.toolConfig[toolSetKey];
    if (!isRecord(toolSet) || !Array.isArray(toolSet.toolList)) return node;

    let nodeChanged = false;
    const toolList = toolSet.toolList.map((tool) => {
      if (!isRecord(tool)) return tool;

      let toolChanged = false;
      const transformedTool = Object.fromEntries(
        Object.entries(tool).map(([key, value]) => {
          if (!schemaKeys.has(key)) return [key, value];

          const transformedValue = transformSchema(value);
          if (transformedValue !== value) {
            toolChanged = true;
            nodeChanged = true;
            changed = true;
          }
          return [key, transformedValue];
        })
      );

      return toolChanged ? transformedTool : tool;
    });

    if (!nodeChanged) return node;

    return {
      ...node,
      toolConfig: {
        ...node.toolConfig,
        [toolSetKey]: {
          ...toolSet,
          toolList
        }
      }
    };
  });

  return (changed ? transformedNodes : nodes) as T;
};

const encodeSchema = (schema: unknown) =>
  schema && typeof schema === 'object' ? JSON.stringify(schema) : schema;

const decodeSchema = (schema: unknown) => {
  // Historical data may still contain objects; keep reads backward compatible.
  if (schema === undefined || schema === null || typeof schema === 'object') return schema;
  if (typeof schema !== 'string') {
    throw new TypeError('Stored tool JSON Schema must be a string');
  }
  return JSON.parse(schema);
};

type ToolConfigTransformResult = {
  value: unknown;
  changed: boolean;
  isMcpOrHttp: boolean;
};

/** Extract the parent toolset ID from a canonical MCP/HTTP child tool ID. */
const getToolSetIdFromToolId = (toolId: unknown, type: ToolSetStorageType) => {
  if (typeof toolId !== 'string' || !toolId) return undefined;

  const prefix = `${type}-`;
  if (!toolId.startsWith(prefix)) return undefined;

  const toolIdBody = toolId.slice(prefix.length);
  const separatorIndex = toolIdBody.indexOf('/');
  if (separatorIndex < 0) return undefined;

  return toolIdBody.slice(0, separatorIndex) || undefined;
};

/** Resolve a toolset reference from a tool config or its historical fallback ID. */
const getToolSetReferenceId = ({
  toolConfig,
  type,
  fallbackToolId
}: {
  toolConfig: Record<string, unknown>;
  type: ToolSetStorageType;
  fallbackToolId?: string;
}) => {
  const toolSet = toolConfig[ToolSetConfigKey[type]];
  if (isRecord(toolSet) && typeof toolSet.toolId === 'string' && toolSet.toolId) {
    return toolSet.toolId;
  }

  const tool = toolConfig[`${type}Tool`];
  return (
    getToolSetIdFromToolId(isRecord(tool) ? tool.toolId : undefined, type) ??
    getToolSetIdFromToolId(fallbackToolId, type) ??
    fallbackToolId
  );
};

/** Replace a full tool or toolset snapshot with its persisted ID-only reference. */
const compactToolReference = (config: unknown, toolId?: unknown) => {
  if (!isRecord(config)) {
    return { value: config, changed: false };
  }
  if (typeof toolId !== 'string' || !toolId) {
    // An unresolvable historical snapshot cannot be executed safely. Drop it
    // instead of writing its runtime URL, credentials, or JSON Schemas back.
    return { value: undefined, changed: true };
  }
  if (Object.keys(config).length === 1 && config.toolId === toolId) {
    return { value: config, changed: false };
  }
  return { value: { toolId }, changed: true };
};

/** Compact MCP/HTTP entries in one node-level persistence pass. */
const compactToolConfig = (value: unknown, fallbackToolId?: string): ToolConfigTransformResult => {
  if (!isRecord(value)) {
    return { value, changed: false, isMcpOrHttp: false };
  }

  let compactedConfig = value;
  let changed = false;
  let isMcpOrHttp = false;

  for (const type of ['mcp', 'http'] as const) {
    const toolKey = `${type}Tool`;
    const toolSetKey = ToolSetConfigKey[type];
    const tool = compactedConfig[toolKey];
    const toolSet = compactedConfig[toolSetKey];

    if (isRecord(tool)) {
      isMcpOrHttp = true;
      const result = compactToolReference(tool, tool.toolId);
      if (result.changed) {
        if (result.value === undefined) {
          const { [toolKey]: _tool, ...rest } = compactedConfig;
          compactedConfig = rest;
        } else {
          compactedConfig = { ...compactedConfig, [toolKey]: result.value };
        }
        changed = true;
      }
    }

    if (isRecord(toolSet)) {
      isMcpOrHttp = true;
      const result = compactToolReference(
        toolSet,
        getToolSetReferenceId({
          toolConfig: compactedConfig,
          type,
          fallbackToolId
        })
      );
      if (result.changed) {
        if (result.value === undefined) {
          const { [toolSetKey]: _toolSet, ...rest } = compactedConfig;
          compactedConfig = rest;
        } else {
          compactedConfig = { ...compactedConfig, [toolSetKey]: result.value };
        }
        changed = true;
      }
    }
  }

  return { value: compactedConfig, changed, isMcpOrHttp };
};

/** Compact a workflow node and any Agent selected tool snapshots it contains. */
const compactWorkflowNode = (node: Record<string, unknown>) => {
  let compactedNode = node;
  let changed = false;

  const nodeToolConfig = node.toolConfig;
  const nodeToolConfigResult = compactToolConfig(
    nodeToolConfig,
    typeof node.pluginId === 'string' ? node.pluginId : undefined
  );
  if (nodeToolConfigResult.changed) {
    compactedNode = {
      ...compactedNode,
      toolConfig: NodeToolConfigStorageTypeSchema.parse(nodeToolConfigResult.value)
    };
    changed = true;
  }

  if (
    nodeToolConfigResult.isMcpOrHttp &&
    Object.prototype.hasOwnProperty.call(compactedNode, 'version')
  ) {
    const { version: _version, ...rest } = compactedNode;
    compactedNode = rest;
    changed = true;
  }

  const inputs = Array.isArray(compactedNode.inputs) ? compactedNode.inputs : undefined;
  const selectedToolsInput = inputs?.find(
    (input) => isRecord(input) && input.key === NodeInputKeyEnum.selectedTools
  );
  if (!selectedToolsInput || !Array.isArray(selectedToolsInput.value)) {
    return { node: compactedNode, changed };
  }

  let selectedToolsChanged = false;
  const selectedTools = selectedToolsInput.value.map((tool: unknown) => {
    if (!isRecord(tool)) return tool;

    const toolId =
      typeof tool.pluginId === 'string'
        ? tool.pluginId
        : typeof tool.id === 'string'
          ? tool.id
          : undefined;
    const toolConfigResult = compactToolConfig(tool.toolConfig, toolId);
    const shouldRemoveVersion =
      toolConfigResult.isMcpOrHttp && Object.prototype.hasOwnProperty.call(tool, 'version');
    if (!toolConfigResult.changed && !shouldRemoveVersion) return tool;

    const nextTool: Record<string, unknown> = {
      ...tool,
      ...(toolConfigResult.changed
        ? { toolConfig: NodeToolConfigStorageTypeSchema.parse(toolConfigResult.value) }
        : {})
    };
    if (shouldRemoveVersion) delete nextTool.version;
    selectedToolsChanged = true;
    return nextTool;
  });

  if (!selectedToolsChanged) return { node: compactedNode, changed };

  return {
    node: {
      ...compactedNode,
      inputs: inputs!.map((input) =>
        input === selectedToolsInput ? { ...input, value: selectedTools } : input
      )
    },
    changed: true
  };
};

/** Compact workflow MCP/HTTP tool snapshots to toolset references. */
export const compactWorkflowToolConfigsForStorage = <T>(nodes: T): T => {
  if (!Array.isArray(nodes)) return nodes;

  let changed = false;
  const compactedNodes = nodes.map((node) => {
    if (!isRecord(node)) return node;

    const result = compactWorkflowNode(node);
    changed ||= result.changed;
    return result.changed ? result.node : node;
  });

  return (changed ? compactedNodes : nodes) as T;
};

/** Encode MCP tool JSON Schemas as Mongo-safe strings. */
export const encodeMcpToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, 'mcp', encodeSchema);

/** Encode HTTP tool JSON Schemas as Mongo-safe strings. */
export const encodeHttpToolSetNodesForStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, 'http', encodeSchema);

/** Decode MCP tool JSON Schemas from Mongo storage for runtime use. */
export const decodeMcpToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, 'mcp', decodeSchema);

/** Decode HTTP tool JSON Schemas from Mongo storage for runtime use. */
export const decodeHttpToolSetNodesFromStorage = <T>(nodes: T): T =>
  transformToolSetNodes(nodes, 'http', decodeSchema);

/** Decode MCP/HTTP toolset nodes without changing ordinary nodes. */
export const decodeToolSetNodesFromStorage = <T>(nodes: T): T =>
  decodeHttpToolSetNodesFromStorage(decodeMcpToolSetNodesFromStorage(nodes));

/** Convert historical object schemas for the raw Mongo migration script. */
export const cleanToolSetJsonSchemasForStorage = <T>(
  nodes: T,
  type: ToolSetStorageType
): {
  nodes: T;
  changed: boolean;
  convertedSchemaCount: number;
} => {
  let convertedSchemaCount = 0;
  const cleanedNodes = transformToolSetNodes(nodes, type, (schema) => {
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
