import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import {
  HttpToolConfigTypeSchema,
  type HttpToolConfigType
} from '@fastgpt/global/core/app/tool/httpTool/type';
import { getHTTPToolRuntimeSchemas } from '@fastgpt/global/core/app/tool/httpTool/utils';
import { McpToolConfigSchema } from '@fastgpt/global/core/app/tool/mcpTool/type';

/** 检查节点内 MCP 工具集保存条件；空草稿不经过此校验。 */
export const getMcpToolSetConfigError = ({
  url,
  toolList
}: {
  url: string;
  toolList: unknown[];
}) => {
  if (!url || url.trim() !== url) return 'invalid_url';

  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return 'invalid_url';
  } catch {
    return 'invalid_url';
  }

  if (toolList.length === 0) return 'empty_tool_list';

  const names = new Set<string>();
  for (const tool of toolList) {
    const parsedTool = McpToolConfigSchema.safeParse(tool);
    if (!parsedTool.success) return 'invalid_tool_schema';
    const name = parsedTool.data.name.trim();
    if (!name) return 'empty_tool_name';
    if (names.has(name)) return 'duplicate_tool_name';
    names.add(name);
  }
};

/** 校验工作流节点 OpenAPI 配置，避免保存无法展开或执行的 operation。 */
export const getHttpToolSetConfigError = async ({
  baseUrl,
  apiSchemaStr,
  customHeaders,
  toolList,
  allowToolSubset = false
}: {
  baseUrl: string;
  apiSchemaStr: string;
  customHeaders: string;
  toolList: unknown[];
  allowToolSubset?: boolean;
}): Promise<string | undefined> => {
  if (!baseUrl || baseUrl.trim() !== baseUrl) return 'invalid_base_url';

  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return 'invalid_base_url';
    }
  } catch {
    return 'invalid_base_url';
  }

  try {
    const headers: unknown = JSON.parse(customHeaders || '{}');
    if (
      !headers ||
      typeof headers !== 'object' ||
      Array.isArray(headers) ||
      Object.values(headers).some((value) => typeof value !== 'string')
    ) {
      return 'invalid_custom_headers';
    }
  } catch {
    return 'invalid_custom_headers';
  }

  if (!apiSchemaStr.trim()) return 'invalid_openapi_schema';
  const openApiSchema = await str2OpenApiSchema(apiSchemaStr).catch(() => undefined);
  if (!openApiSchema) return 'invalid_openapi_schema';
  if (!openApiSchema.pathData.length || (!allowToolSubset && !toolList.length)) {
    return 'empty_tool_list';
  }

  const operations = new Set(
    openApiSchema.pathData.map((operation) => `${operation.method.toUpperCase()} ${operation.path}`)
  );
  const validSchemaTypes = new Set([
    'array',
    'boolean',
    'integer',
    'null',
    'number',
    'object',
    'string'
  ]);
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const isValidRootSchema = (schema: unknown) => {
    if (!isRecord(schema)) return false;
    const type = schema.type;
    const types = Array.isArray(type) ? type : [type];
    return (
      types.length > 0 &&
      types.every(
        (item) => item === undefined || (typeof item === 'string' && validSchemaTypes.has(item))
      )
    );
  };
  const toolNames = new Set<string>();
  const toolOperations = new Set<string>();
  for (const value of toolList) {
    const parsedTool = HttpToolConfigTypeSchema.safeParse(value);
    if (!parsedTool.success) return 'invalid_tool_schema';
    const tool = parsedTool.data;
    const name = tool.name.trim();
    if (!name) return 'empty_tool_name';
    if (toolNames.has(name)) return 'duplicate_tool_name';
    toolNames.add(name);

    const operation = `${tool.method.toUpperCase()} ${tool.path}`;
    if (!operations.has(operation) || toolOperations.has(operation)) return 'invalid_operation';
    toolOperations.add(operation);
    if (
      !isValidRootSchema(tool.inputSchema) ||
      (tool.requestSchema !== undefined && !isValidRootSchema(tool.requestSchema)) ||
      !isValidRootSchema(getHTTPToolRuntimeSchemas(tool).requestSchema)
    ) {
      return 'invalid_tool_schema';
    }
  }

  if (!allowToolSubset && toolOperations.size !== operations.size) return 'invalid_operation';
};

/** 用户显式重导入或修改 OpenAPI 时，用完整解析结果替换节点工具子集。 */
export const getNodeHttpToolListForSave = ({
  currentToolList,
  importedToolList,
  currentApiSchemaStr,
  nextApiSchemaStr,
  isExplicitImport
}: {
  currentToolList: HttpToolConfigType[];
  importedToolList: HttpToolConfigType[];
  currentApiSchemaStr: string;
  nextApiSchemaStr: string;
  isExplicitImport: boolean;
}) =>
  isExplicitImport || currentApiSchemaStr !== nextApiSchemaStr ? importedToolList : currentToolList;
