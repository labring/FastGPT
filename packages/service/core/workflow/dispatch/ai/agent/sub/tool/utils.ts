import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getChildAppPreviewNode } from '../../../../../../app/tool/controller';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../../../../../../../support/permission/app/auth';
import { addLog } from '../../../../../../../common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../../../../../../workflow/utils';
import { MongoApp } from '../../../../../../app/schema';
import { getMCPChildren } from '../../../../../../app/mcp';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import {
  NodeInputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { SubAppInitType } from '../type';

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
        jsonSchema = (input.value as McpToolDataType).inputSchema;
      }
    }

    const description = JSON.stringify({
      type: flowNodeType,
      name: name,
      intro: toolDescription || intro
    });

    if (jsonSchema) {
      return {
        type: 'function',
        function: {
          name: toolId,
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
        name: toolId,
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
        const { source, pluginId } = splitCombineToolId(tool.id);
        const [toolNode] = await Promise.all([
          getChildAppPreviewNode({
            appId: pluginId,
            lang
          }),
          ...(source === AppToolSourceEnum.personal
            ? [
                authAppByTmbId({
                  tmbId,
                  appId: pluginId,
                  per: ReadPermissionVal
                })
              ]
            : [])
        ]);

        const removePrefixId = pluginId.replace(`${source}-`, '');
        const requestToolId = `t${removePrefixId}`;
        console.log(requestToolId);

        if (toolNode.flowNodeType === FlowNodeTypeEnum.toolSet) {
          const systemToolId = toolNode.toolConfig?.systemToolSet?.toolId;
          const mcpToolsetVal = toolNode.toolConfig?.mcpToolSet ?? toolNode.inputs[0].value;
          if (systemToolId) {
            const children = await getSystemToolRunTimeNodeFromSystemToolset({
              toolSetNode: {
                toolConfig: toolNode.toolConfig,
                inputs: toolNode.inputs,
                nodeId: requestToolId
              },
              lang
            });

            return children.map((child) => ({
              id: child.nodeId,
              name: child.name,
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

            const parentId = mcpToolsetVal.toolId ?? toolNode.pluginId;
            const children = toolList.map((tool, index) => {
              const newToolNode = getMCPToolRuntimeNode({
                avatar: toolNode.avatar,
                tool,
                // New ?? Old
                parentId
              });
              newToolNode.nodeId = `${parentId}${index}`; // ID 不能随机，否则下次生成时候就和之前的记录对不上
              newToolNode.name = `${toolNode.name}/${tool.name}`;

              return newToolNode;
            });

            return children.map((child) => {
              return {
                id: child.nodeId,
                name: child.name,
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
          return [
            {
              id: requestToolId,
              name: toolNode.name,
              version: toolNode.version,
              toolConfig: toolNode.toolConfig,
              params: tool.config,
              requestSchema: formatSchema({
                toolId: requestToolId,
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
