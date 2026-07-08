import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { nodeInputs2JsonSchema } from '@fastgpt/global/core/app/jsonschema';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { ToolNodeItemType } from '../type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  canInputBeAgentGenerated,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  getAgentLoopCoreSystemToolInfo,
  type AgentLoopCoreToolInfo
} from '../../agentLoopCore/interface';

export type ToolInfo = AgentLoopCoreToolInfo<ToolNodeItemType>;

const buildModelVisibleJsonSchema = ({
  inputs,
  toolParams,
  jsonSchema
}: {
  inputs?: FlowNodeInputItemType[];
  toolParams: FlowNodeInputItemType[];
  jsonSchema?: Record<string, any>;
}) => {
  const inputKeys = new Set(inputs?.map((input) => input.key) ?? []);
  const modelVisibleKeys = new Set(toolParams.map((input) => input.key));

  if (jsonSchema) {
    const properties = jsonSchema.properties || {};
    const isModelVisibleKey = (key: string) => {
      if (modelVisibleKeys.has(key)) return true;
      if (inputKeys.has(key)) return false;
      return (properties[key] as { isToolParam?: boolean } | undefined)?.isToolParam === true;
    };
    const nextSchema: Record<string, any> = {
      ...jsonSchema,
      properties: Object.fromEntries(
        Object.entries(properties).filter(([key]) => isModelVisibleKey(key))
      )
    };

    if (Array.isArray(jsonSchema.required)) {
      nextSchema.required = jsonSchema.required.filter((key: string) => isModelVisibleKey(key));
    } else if ('required' in jsonSchema) {
      nextSchema.required = jsonSchema.required;
    }

    return nextSchema;
  }

  return nodeInputs2JsonSchema({ inputs: toolParams });
};

export const createToolSchema = (item: ToolNodeItemType): ChatCompletionTool => {
  const toolParams = item.toolParams.filter(
    (input) => isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input)
  );

  if (item.jsonSchema) {
    return {
      type: 'function',
      function: {
        name: item.nodeId,
        description: `${item.name}: ${item.toolDescription || item.intro}`,
        parameters: buildModelVisibleJsonSchema({
          inputs: item.inputs ?? item.toolParams,
          toolParams,
          jsonSchema: item.jsonSchema
        })
      }
    };
  }

  return {
    type: 'function',
    function: {
      name: item.nodeId,
      description: `${item.name}: ${item.toolDescription || item.intro}`,
      parameters: buildModelVisibleJsonSchema({ toolParams })
    }
  };
};

/**
 * 工具分类
 */
export const useToolCatalog = async ({
  messages,
  toolNodes,
  useAgentSandbox,
  lang
}: {
  messages: ChatCompletionMessageParam[];
  toolNodes: ToolNodeItemType[];
  useAgentSandbox?: boolean;
  lang?: localeType;
}) => {
  let finalMessages = messages;
  const toolNodesMap = new Map<string, ToolNodeItemType>();

  /**
   * LLM 只认识 function schema，这里同时保留 nodeId -> 原始工具节点的映射，
   * 后续执行工具和展示 nodeResponse 都从同一份 catalog 取名字/头像，避免两边各自拼。
   */
  const tools: ChatCompletionTool[] = toolNodes
    .map((item) => {
      if (item.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
        toolNodesMap.set(item.nodeId, item);
        return undefined;
      }

      toolNodesMap.set(item.nodeId, item);
      return createToolSchema(item);
    })
    .filter((tool): tool is ChatCompletionTool => !!tool);

  const sandboxEnabled = !!useAgentSandbox && !!global.feConfigs?.show_agent_sandbox;

  if (sandboxEnabled) {
    const systemMessage = messages.find((message) => message.role === 'system');
    if (systemMessage) {
      finalMessages = messages.map((message) =>
        message.role === 'system'
          ? { ...message, content: `${message.content}\n\n${SANDBOX_SYSTEM_PROMPT}` }
          : message
      );
    } else {
      finalMessages = [{ role: 'system', content: SANDBOX_SYSTEM_PROMPT }, ...messages];
    }
  }

  const getToolInfo = (name: string): ToolInfo | undefined => {
    const systemToolInfo = getAgentLoopCoreSystemToolInfo({ name, lang });
    if (systemToolInfo) {
      return {
        ...systemToolInfo,
        avatar: systemToolInfo.avatar || ''
      };
    }

    const toolNode = toolNodesMap.get(name);
    if (toolNode) {
      return {
        type: 'user',
        name: toolNode.name,
        avatar: toolNode.avatar,
        rawData: toolNode
      };
    }
  };

  return {
    finalMessages,
    tools,
    getToolInfo
  };
};
