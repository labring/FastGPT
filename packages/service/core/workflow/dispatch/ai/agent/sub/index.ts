import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { PlanAgentTool } from './plan/constants';
import { getFileReadTool } from './constants';
import { ModelAgentTool } from './model/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import {
  NodeInputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../../../../utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { MongoApp } from '../../../../../app/schema';
import { getMCPChildren } from '../../../../../app/mcp';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/mcpTools/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { StopAgentTool } from './stop/constants';

export const rewriteSubAppsToolset = ({
  subApps,
  lang
}: {
  subApps: RuntimeNodeItemType[];
  lang?: localeType;
}) => {
  return Promise.all(
    subApps.map(async (node) => {
      if (node.flowNodeType === FlowNodeTypeEnum.toolSet) {
        const systemToolId = node.toolConfig?.systemToolSet?.toolId;
        const mcpToolsetVal = node.toolConfig?.mcpToolSet ?? node.inputs[0].value;
        if (systemToolId) {
          const children = await getSystemToolRunTimeNodeFromSystemToolset({
            toolSetNode: node,
            lang
          });
          return children;
        } else if (mcpToolsetVal) {
          const app = await MongoApp.findOne({ _id: node.pluginId }).lean();
          if (!app) return [];
          const toolList = await getMCPChildren(app);

          const parentId = mcpToolsetVal.toolId ?? node.pluginId;
          const children = toolList.map((tool, index) => {
            const newToolNode = getMCPToolRuntimeNode({
              avatar: node.avatar,
              tool,
              // New ?? Old
              parentId
            });
            newToolNode.nodeId = `${parentId}${index}`; // ID 不能随机，否则下次生成时候就和之前的记录对不上
            newToolNode.name = `${node.name}/${tool.name}`;

            return newToolNode;
          });

          return children;
        }
        return [];
      } else {
        return [node];
      }
    })
  ).then((res) => res.flat());
};
export const getSubApps = ({
  subApps,
  urls
}: {
  subApps: RuntimeNodeItemType[];
  urls?: string[];
}): ChatCompletionTool[] => {
  // System Tools: Plan Agent, stop sign, model agent.
  const systemTools: ChatCompletionTool[] = [
    PlanAgentTool,
    StopAgentTool,
    ModelAgentTool,
    getFileReadTool(urls)
  ];

  // Node Tools
  const nodeTools = subApps.map<ChatCompletionTool>((item) => {
    const toolParams: FlowNodeInputItemType[] = [];
    let jsonSchema: JSONSchemaInputType | undefined;

    for (const input of item.inputs) {
      if (input.toolDescription) {
        toolParams.push(input);
      }

      if (input.key === NodeInputKeyEnum.toolData) {
        jsonSchema = (input.value as McpToolDataType).inputSchema;
      }
    }

    const description = JSON.stringify({
      type: item.flowNodeType,
      name: item.name,
      intro: item.toolDescription || item.intro
    });

    if (jsonSchema) {
      return {
        type: 'function',
        function: {
          name: item.nodeId,
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
        name: item.nodeId,
        description,
        parameters: {
          type: 'object',
          properties,
          required: toolParams.filter((param) => param.required).map((param) => param.key)
        }
      }
    };
  });

  return [...systemTools, ...nodeTools];
};
