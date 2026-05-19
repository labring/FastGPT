import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/tools';
import type { JsonSchemaPropertiesItemType } from '@fastgpt/global/core/app/jsonschema';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getSandboxToolInfo, injectSandboxFiles } from '../../../../../ai/sandbox/toolCall';
import type { FileInputType, ToolNodeItemType } from '../type';
import { ReadFileTooData, ReadFileToolSchema } from '../tools/file';

export type ToolInfo =
  | {
      type: 'file';
      name: string;
      avatar: string;
    }
  | {
      type: 'sandbox';
      name: string;
      avatar: string;
    }
  | {
      type: 'user';
      name: string;
      avatar?: string;
      rawData: ToolNodeItemType;
    };

const createToolSchema = (item: ToolNodeItemType): ChatCompletionTool => {
  if (item.jsonSchema) {
    return {
      type: 'function',
      function: {
        name: item.nodeId,
        description: `${item.name}: ${item.toolDescription || item.intro}`,
        parameters: item.jsonSchema
      }
    };
  }

  const properties: Record<string, JsonSchemaPropertiesItemType> = {};
  item.toolParams.forEach((input) => {
    const jsonSchema = input.valueType
      ? valueTypeJsonSchemaMap[input.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    properties[input.key] = {
      ...jsonSchema,
      description: input.toolDescription || '',
      enum: input.enum?.split('\n').filter(Boolean) || undefined
    };
  });

  return {
    type: 'function',
    function: {
      name: item.nodeId,
      description: `${item.name}: ${item.toolDescription || item.intro}`,
      parameters: {
        type: 'object',
        properties,
        required: item.toolParams.filter((input) => input.required).map((input) => input.key)
      }
    }
  };
};

/**
 * 工具分类
 */
export const useToolCatalog = async ({
  messages,
  toolNodes,
  currentInputFiles,
  useAgentSandbox,
  lang,
  appId,
  userId,
  chatId
}: {
  messages: ChatCompletionMessageParam[];
  toolNodes: ToolNodeItemType[];
  currentInputFiles: FileInputType[];
  useAgentSandbox?: boolean;
  lang?: localeType;
  appId: string;
  userId: string;
  chatId: string;
}) => {
  let finalMessages = messages;
  const toolNodesMap = new Map<string, ToolNodeItemType>();

  /**
   * LLM 只认识 function schema，这里同时保留 nodeId -> 原始工具节点的映射，
   * 后续执行工具和展示 nodeResponse 都从同一份 catalog 取名字/头像，避免两边各自拼。
   */
  const tools: ChatCompletionTool[] = toolNodes.map((item) => {
    toolNodesMap.set(item.nodeId, item);
    return createToolSchema(item);
  });

  tools.push(ReadFileToolSchema);

  if (useAgentSandbox && global.feConfigs?.show_agent_sandbox) {
    tools.push(...SANDBOX_TOOLS);

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

    if (currentInputFiles.length > 0) {
      await injectSandboxFiles({
        appId,
        userId,
        chatId,
        files: currentInputFiles.map((file) => ({
          path: file.sandboxPath!,
          url: file.url
        }))
      });
    }
  }

  const getToolInfo = (name: string): ToolInfo | undefined => {
    if (name === ReadFileTooData.id) {
      return {
        type: 'file',
        name: parseI18nString(ReadFileTooData.name, lang),
        avatar: ReadFileTooData.avatar
      };
    }

    const sandboxToolInfo = getSandboxToolInfo(name, lang);
    if (sandboxToolInfo) {
      return {
        type: 'sandbox',
        name: sandboxToolInfo.name,
        avatar: sandboxToolInfo.avatar
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
