import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getChildAppPreviewNode } from '../../../../../../app/tool/controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../../../../../../../support/permission/app/auth';
import { addLog } from '../../../../../../../common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../../../../../../workflow/utils';
import { MongoApp } from '../../../../../../app/schema';
import { getMCPChildren } from '../../../../../../app/mcp';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { getHTTPToolRuntimeNode } from '@fastgpt/global/core/app/tool/httpTool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import {
  NodeInputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import type { SubAppInitType } from '../type';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';

export const agentSkillToToolRuntime = async ({
  tools,
  tmbId,
  lang
}: {
  tools: SkillToolType[];
  tmbId: string;
  lang?: localeType;
}): Promise<SubAppInitType[]> => {
  const formatSchema = ({
    toolId,
    inputs,
    flowNodeType,
    name,
    toolDescription,
    intro
  }: {
    toolId: string;
    inputs: FlowNodeInputItemType[];
    flowNodeType: FlowNodeTypeEnum;
    name: string;
    toolDescription?: string;
    intro?: string;
  }): ChatCompletionTool => {
    const toolParams: FlowNodeInputItemType[] = [];
    let jsonSchema: JSONSchemaInputType | undefined;

    for (const input of inputs) {
      if (input.toolDescription) {
        toolParams.push(input);
      }

      if (input.key === NodeInputKeyEnum.toolData) {
        jsonSchema = (input.value as McpToolDataType)?.inputSchema;
      }
    }

    const description = JSON.stringify({
      type: flowNodeType,
      name: name,
      intro: toolDescription || intro
    });
    const formatToolId = `t${toolId}`;

    if (jsonSchema) {
      return {
        type: 'function',
        function: {
          name: formatToolId,
          description,
          parameters: jsonSchema
        }
      };
    }

    const properties: Record<string, any> = {};
    toolParams.forEach((param) => {
      const jsonSchema = param.valueType
        ? valueTypeJsonSchemaMap[param.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;

      properties[param.key] = {
        ...jsonSchema,
        description: param.toolDescription || '',
        enum: param.enum?.split('\n').filter(Boolean) || undefined
      };
    });

    return {
      type: 'function',
      function: {
        name: formatToolId,
        description,
        parameters: {
          type: 'object',
          properties,
          required: toolParams.filter((param) => param.required).map((param) => param.key)
        }
      }
    };
  };

  return Promise.all(
    tools.map<Promise<SubAppInitType[]>>(async (tool) => {
      try {
        const { pluginId, authAppId } = splitCombineToolId(tool.id);

        const [toolNode] = await Promise.all([
          getChildAppPreviewNode({
            appId: tool.id,
            lang
          }),
          ...(authAppId
            ? [
                authAppByTmbId({
                  tmbId,
                  appId: authAppId,
                  per: ReadPermissionVal
                })
              ]
            : [])
        ]);
        // console.log('toolNode', toolNode)
        // Check if tool configuration is complete
        // 1. Add config value to toolNode.inputs
        toolNode.inputs.forEach((input) => {
          const value = tool.config[input.key];
          if (value) {
            input.value = value;
          }
        });
        // 2. Check config status
        const configStatus = getToolConfigStatus({
          tool: toolNode
        });
        if (configStatus.status === 'waitingForConfig') {
          addLog.warn(`[Agent] tool config incomplete`, {
            toolId: tool.id,
            toolName: toolNode.name
          });
          return [];
        }

        const toolType = (() => {
          if (toolNode.flowNodeType === FlowNodeTypeEnum.appModule) {
            return 'workflow';
          }
          if (toolNode.flowNodeType === FlowNodeTypeEnum.pluginModule) {
            return 'toolWorkflow';
          }
          return 'tool';
        })();

        if (toolNode.flowNodeType === FlowNodeTypeEnum.toolSet) {
          const systemToolId = toolNode.toolConfig?.systemToolSet?.toolId;
          const mcpToolsetVal = toolNode.toolConfig?.mcpToolSet ?? toolNode.inputs[0]?.value;
          const httpToolsetVal = toolNode.toolConfig?.httpToolSet;

          if (systemToolId) {
            const children = await getSystemToolRunTimeNodeFromSystemToolset({
              toolSetNode: {
                toolConfig: toolNode.toolConfig,
                inputs: toolNode.inputs,
                nodeId: pluginId
              },
              lang
            });

            return children.map((child) => ({
              type: 'tool',
              id: child.nodeId,
              name: child.name,
              avatar: child.avatar,
              version: child.version,
              toolConfig: child.toolConfig,
              params: tool.config,
              requestSchema: formatSchema({
                toolId: child.nodeId,
                inputs: child.inputs,
                flowNodeType: child.flowNodeType,
                name: child.name,
                toolDescription: child.toolDescription,
                intro: child.intro
              })
            }));
          } else if (mcpToolsetVal) {
            const app = await MongoApp.findOne({ _id: toolNode.pluginId }).lean();
            if (!app) return [];
            const toolList = await getMCPChildren(app);

            const toolSetId = mcpToolsetVal.toolId ?? toolNode.pluginId;
            const children = toolList.map((tool, index) => {
              const newToolNode = getMCPToolRuntimeNode({
                toolSetId,
                nodeId: `${toolSetId}${index}`,
                avatar: toolNode.avatar,
                tool: {
                  ...tool,
                  name: `${toolNode.name}/${tool.name}`
                }
              });

              return newToolNode;
            });

            return children.map((child) => {
              return {
                type: 'tool',
                id: child.nodeId,
                name: child.name,
                avatar: child.avatar,
                version: child.version,
                toolConfig: child.toolConfig,
                params: tool.config,
                requestSchema: formatSchema({
                  toolId: child.nodeId,
                  inputs: child.inputs,
                  flowNodeType: child.flowNodeType,
                  name: child.name,
                  toolDescription: child.toolDescription,
                  intro: child.intro
                })
              };
            });
          } else if (httpToolsetVal) {
            const children = httpToolsetVal.toolList.map((tool: HttpToolConfigType, index) => {
              const newToolNode = getHTTPToolRuntimeNode({
                tool: {
                  ...tool,
                  name: `${toolNode.name}/${tool.name}`
                },
                nodeId: `${pluginId}${index}`,
                avatar: toolNode.avatar,
                toolSetId: pluginId
              });

              return newToolNode;
            });

            return children.map((child) => {
              return {
                type: 'tool',
                id: child.nodeId,
                name: child.name,
                avatar: child.avatar,
                version: child.version,
                toolConfig: child.toolConfig,
                params: tool.config,
                requestSchema: formatSchema({
                  toolId: child.nodeId,
                  inputs: child.inputs,
                  flowNodeType: child.flowNodeType,
                  name: child.name,
                  toolDescription: child.toolDescription,
                  intro: child.intro
                })
              };
            });
          }

          return [];
        } else {
          const cleanedPluginId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');

          return [
            {
              type: toolType,
              id: cleanedPluginId,
              name: toolNode.name,
              avatar: toolNode.avatar,
              version: toolNode.version,
              toolConfig: toolNode.toolConfig,
              params: tool.config,
              requestSchema: formatSchema({
                toolId: cleanedPluginId,
                inputs: toolNode.inputs,
                flowNodeType: toolNode.flowNodeType,
                name: toolNode.name,
                toolDescription: toolNode.toolDescription,
                intro: toolNode.intro
              })
            }
          ];
        }
      } catch (error) {
        addLog.warn(`[Agent] tool load error`, {
          toolId: tool.id,
          error: getErrText(error)
        });
        return [];
      }
    })
  ).then((res) => res.flat());
};
