import {
  getHTTPToolRuntimeNode,
  pathData2ToolList
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { getApiSchemaByUrl } from '@/web/core/app/api/httpTools';
import { getMCPTools } from '@/web/core/app/api/mcpTools';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  HttpToolSetNodeConfigSchema,
  McpToolSetNodeConfigSchema
} from '@fastgpt/global/core/workflow/type/node';

export type ToolSetDebugData =
  | { type: 'mcp'; toolList: McpToolConfigType[] }
  | { type: 'http'; toolList: HttpToolConfigType[]; apiSchemaStr: string; serverPath: string };

/** 调试使用当前远端定义；父节点只保留名称和描述摘要。 */
export const getToolSetDebugData = async (
  toolSetNode: RuntimeNodeItemType
): Promise<ToolSetDebugData> => {
  const mcpToolSet = McpToolSetNodeConfigSchema.safeParse(toolSetNode.toolConfig?.mcpToolSet).data;
  if (!toolSetNode.pluginId && mcpToolSet) {
    const savedDescriptions = new Map(
      mcpToolSet.toolList.map((tool) => [tool.name, tool.description])
    );
    const toolList = await getMCPTools({
      url: mcpToolSet.url,
      headerSecret: mcpToolSet.headerSecret ?? undefined
    });

    return {
      type: 'mcp',
      toolList: toolList.map((tool) => ({
        ...tool,
        description: savedDescriptions.has(tool.name)
          ? savedDescriptions.get(tool.name)!
          : tool.description || ''
      }))
    };
  }

  const httpToolSet = HttpToolSetNodeConfigSchema.safeParse(
    toolSetNode.toolConfig?.httpToolSet
  ).data;
  if (!toolSetNode.pluginId && httpToolSet) {
    if (!httpToolSet.apiSchemaUrl) throw new Error('HTTP tool set schema URL is missing');
    const apiSchemaStr = JSON.stringify(await getApiSchemaByUrl(httpToolSet.apiSchemaUrl));
    const { pathData, serverPath } = await str2OpenApiSchema(apiSchemaStr);
    const savedDescriptions = new Map(
      httpToolSet.toolList.map((tool) => [tool.name, tool.description])
    );

    return {
      type: 'http',
      toolList: (await pathData2ToolList(pathData)).map((tool) => ({
        ...tool,
        description: savedDescriptions.has(tool.name)
          ? savedDescriptions.get(tool.name)!
          : tool.description || ''
      })),
      apiSchemaStr,
      serverPath
    };
  }

  throw new Error('Tool set debug is not available for this node');
};

/** 将单个远端子工具构建为调试入口；引用模式仍使用预览节点。 */
export const getToolSetDebugRuntimeNode = ({
  toolSetNode,
  toolIndex,
  previewNode,
  debugData
}: {
  toolSetNode: RuntimeNodeItemType;
  toolIndex: number;
  previewNode?: Pick<RuntimeNodeItemType, 'name' | 'inputs' | 'outputs' | 'toolConfig' | 'version'>;
  debugData?: ToolSetDebugData;
}): RuntimeNodeItemType | undefined => {
  const mcpToolSet = toolSetNode.toolConfig?.mcpToolSet;
  const httpToolSet = toolSetNode.toolConfig?.httpToolSet;
  const localMcpToolSet = McpToolSetNodeConfigSchema.safeParse(mcpToolSet).data;
  const localHttpToolSet = HttpToolSetNodeConfigSchema.safeParse(httpToolSet).data;
  const toolList = toolSetNode.pluginId
    ? (mcpToolSet?.toolList ?? httpToolSet?.toolList ?? [])
    : (debugData?.toolList ?? []);
  const tool = toolList[toolIndex];
  if (!tool) return;

  if (toolSetNode.pluginId) {
    if (!previewNode?.toolConfig?.mcpTool && !previewNode?.toolConfig?.httpTool) return;
    return {
      nodeId: toolSetNode.nodeId,
      flowNodeType: FlowNodeTypeEnum.tool,
      name: `${toolSetNode.name}/${tool.name}`,
      avatar: toolSetNode.avatar,
      inputs: previewNode.inputs,
      outputs: previewNode.outputs,
      toolConfig: previewNode.toolConfig,
      version: previewNode.version
    };
  }

  if (localMcpToolSet && debugData?.type === 'mcp') {
    const selectedTool = debugData.toolList[toolIndex];
    if (!selectedTool) return;
    return getMCPToolRuntimeNode({
      nodeId: toolSetNode.nodeId,
      toolsetName: toolSetNode.name,
      avatar: toolSetNode.avatar,
      tool: selectedTool,
      url: localMcpToolSet.url,
      headerSecret: localMcpToolSet.headerSecret ?? undefined
    });
  }

  if (localHttpToolSet && debugData?.type === 'http') {
    const selectedTool = debugData.toolList[toolIndex];
    if (!selectedTool) return;
    const runtimeNode = getHTTPToolRuntimeNode({
      nodeId: toolSetNode.nodeId,
      toolsetName: toolSetNode.name,
      avatar: toolSetNode.avatar,
      toolSetId: 'inline',
      tool: selectedTool
    });

    return {
      ...runtimeNode,
      toolConfig: {
        httpTool: {
          ...selectedTool,
          baseUrl: localHttpToolSet.baseUrl?.trim() || debugData.serverPath,
          apiSchemaStr: debugData.apiSchemaStr,
          customHeaders: localHttpToolSet.customHeaders,
          headerSecret: localHttpToolSet.headerSecret ?? undefined
        }
      }
    };
  }
};
