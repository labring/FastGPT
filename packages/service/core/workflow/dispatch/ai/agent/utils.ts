import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { DispatchSubAppResponse, GetSubAppInfoFnType, SubAppRuntimeType } from './type';
import { getAgentRuntimeTools } from './sub/tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { readFileTool, ReadFileToolSchema } from './sub/file/utils';
import { datasetSearchTool } from './sub/dataset/utils';
import { SANDBOX_TOOLS, sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/constants';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { dispatchFileRead } from './sub/file';
import type { DispatchAgentModuleProps } from '.';
import { dispatchAgentDatasetSearch } from './sub/dataset';
import { dispatchSandboxTool } from './sub/sandbox';
import type { CapabilityToolCallHandlerType } from './capability/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { parseJsonArgs } from '../../../../ai/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { dispatchTool } from './sub/tool';
import type { WorkflowResponseItemType } from '../../type';
import { dispatchApp, dispatchPlugin } from './sub/app';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

/**
 * 收集 Agent 节点可用的系统工具、能力工具和用户选择的子应用工具。
 * 返回给 LLM 的 completionTools 与运行时查找用的 subAppsMap 会在这里保持一致。
 */
export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  hasDataset,
  hasFiles,
  useAgentSandbox,
  extraTools
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  hasDataset?: boolean;
  hasFiles: boolean;
  useAgentSandbox?: boolean;
  extraTools?: ChatCompletionTool[];
}): Promise<{
  completionTools: ChatCompletionTool[];
  subAppsMap: Map<string, SubAppRuntimeType>;
}> => {
  const completionTools: ChatCompletionTool[] = [];

  // system tools
  {
    /* File */
    if (hasFiles) {
      completionTools.push(readFileTool);
    }

    /* Dataset Search */
    if (hasDataset) {
      completionTools.push(datasetSearchTool);
    }

    /* Sandbox Shell */
    if (useAgentSandbox && global.feConfigs?.show_agent_sandbox) {
      completionTools.push(...SANDBOX_TOOLS);
    }

    /* Capability extra tools (e.g. sandbox skills) */
    if (extraTools && extraTools.length > 0) {
      completionTools.push(...extraTools);
    }
  }

  /* User tools */
  const subAppsMap = new Map<string, SubAppRuntimeType>();
  const formatTools = await getAgentRuntimeTools({
    tools,
    tmbId,
    lang
  });
  formatTools.forEach((tool) => {
    completionTools.push(tool.requestSchema);
    subAppsMap.set(tool.id, {
      type: tool.type,
      id: tool.id,
      name: tool.name,
      avatar: tool.avatar,
      version: tool.version,
      toolConfig: tool.toolConfig,
      params: tool.params
    });
  });

  return {
    completionTools,
    subAppsMap
  };
};

export type ToolDispatchContext = Pick<
  DispatchAgentModuleProps,
  | 'checkIsStopping'
  | 'chatConfig'
  | 'runningUserInfo'
  | 'runningAppInfo'
  | 'chatId'
  | 'uid'
  | 'variableState'
  | 'externalProvider'
  | 'lang'
  | 'requestOrigin'
  | 'mode'
  | 'timezone'
  | 'retainDatasetCite'
  | 'maxRunTimes'
  | 'workflowDispatchDeep'
  | 'params'
  | 'stream'
> & {
  systemPrompt?: string;
  getSubAppInfo: GetSubAppInfoFnType;
  getSubApp: (id: string) => SubAppRuntimeType | undefined;
  completionTools: ChatCompletionTool[];
  filesMap: Record<string, string>;
  capabilityToolCallHandler?: CapabilityToolCallHandlerType;
  streamResponseFn?: (args: WorkflowResponseItemType) => void | undefined;
};

/**
 * 创建 workflow 工具执行器。
 * 该执行器屏蔽工具来源差异，将沙盒、文件读取、知识库搜索、能力工具和用户子应用统一成 agentLoop 可消费的工具结果。
 */
export const getExecuteTool = ({
  getSubAppInfo,
  getSubApp,
  filesMap,
  capabilityToolCallHandler,
  checkIsStopping,
  chatConfig,
  runningUserInfo,
  runningAppInfo,
  chatId,
  uid,
  variableState,
  externalProvider,
  streamResponseFn,
  params: {
    model,
    // Dataset search configuration
    agent_datasetParams: datasetParams
  },
  lang,
  requestOrigin,
  mode,
  timezone,
  retainDatasetCite,
  maxRunTimes,
  workflowDispatchDeep
}: ToolDispatchContext) => {
  /**
   * 执行单次工具调用，并补齐节点响应的 id、运行时间和计费信息。
   */
  return async ({ callId, toolId, args }: { callId: string; toolId: string; args: string }) => {
    const capabilityAssistantResponses: AIChatItemValueItemType[] = [];
    const startTime = Date.now();

    const {
      response,
      usages = [],
      stop = false,
      nodeResponse
    } = await (async (): Promise<{
      response: string;
      usages?: ChatNodeUsageType[];
      stop?: boolean;
      nodeResponse?: DispatchSubAppResponse['nodeResponse'];
    }> => {
      try {
        if (toolId in sandboxToolMap) {
          const result = await dispatchSandboxTool({
            toolName: toolId,
            rawArgs: args,
            appId: runningAppInfo.id,
            userId: uid,
            chatId,
            lang
          });

          return {
            response: result.response,
            usages: result.usages,
            nodeResponse: result.nodeResponse
          };
        }

        if (toolId === SubAppIds.fileRead) {
          const toolParams = ReadFileToolSchema.safeParse(parseJsonArgs(args));
          if (!toolParams.success) {
            return {
              response: toolParams.error.message,
              usages: []
            };
          }
          const params = toolParams.data;

          const files = params.file_indexes.map((index) => ({
            index,
            url: filesMap[index]
          }));
          const result = await dispatchFileRead({
            files,
            teamId: runningUserInfo.teamId,
            tmbId: runningUserInfo.tmbId,
            customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
            model,
            userKey: externalProvider.openaiAccount
          });

          return {
            response: result.response,
            usages: result.usages,
            nodeResponse: result.nodeResponse
          };
        }
        if (toolId === SubAppIds.datasetSearch) {
          const result = await dispatchAgentDatasetSearch({
            args: args,
            datasetParams,
            teamId: runningUserInfo.teamId,
            tmbId: runningUserInfo.tmbId,
            llmModel: model
          });

          return {
            response: result.response,
            usages: result.usages,
            nodeResponse: result.nodeResponse
          };
        }
        // TODO: 所有skill工具，合并成一个 function，不要依赖 capabilityToolCallHandler
        // Capability tools (e.g. sandbox skills)
        const capResult = await capabilityToolCallHandler?.(toolId, args ?? '', callId);
        if (capResult != null) {
          if (capResult.assistantResponses?.length) {
            capabilityAssistantResponses.push(...capResult.assistantResponses);
          }
          const subInfo = getSubAppInfo(toolId);
          return {
            response: capResult.response,
            usages: capResult.usages,
            nodeResponse: {
              moduleType: FlowNodeTypeEnum.tool,
              moduleName: subInfo.name,
              moduleLogo: subInfo.avatar,
              toolInput: parseJsonArgs(args),
              toolRes: capResult.response
            }
          };
        }

        // User Sub App
        const tool = getSubApp(toolId);
        if (!tool) {
          return {
            response: `Can't find the tool ${toolId}`,
            usages: []
          };
        }

        // Get params
        const toolCallParams = parseJsonArgs(args);
        if (args && !toolCallParams) {
          return {
            response: 'Params is not object'
          };
        }
        const requestParams = {
          ...tool.params,
          ...toolCallParams
        };

        if (tool.type === 'tool') {
          const { response, usages, nodeResponse } = await dispatchTool({
            tool: {
              name: tool.name,
              avatar: tool.avatar,
              version: tool.version,
              toolConfig: tool.toolConfig
            },
            params: requestParams,
            runningUserInfo,
            runningAppInfo,
            chatId,
            uid,
            variableState,
            workflowStreamResponse: streamResponseFn
          });

          return {
            response,
            usages,
            nodeResponse
          };
        } else if (tool.type === 'workflow') {
          const { userChatInput, ...params } = requestParams;

          const { response, usages, nodeResponse } = await dispatchApp({
            app: {
              name: tool.name,
              avatar: tool.avatar,
              id: tool.id
            },
            userChatInput: userChatInput,
            customAppVariables: params,
            checkIsStopping,
            lang,
            requestOrigin,
            mode,
            timezone,
            externalProvider,
            chatId,
            uid,
            runningAppInfo,
            runningUserInfo,
            retainDatasetCite,
            maxRunTimes,
            workflowDispatchDeep,
            variableState
          });

          return {
            response,
            usages,
            nodeResponse
          };
        } else if (tool.type === 'toolWorkflow') {
          const { response, usages, nodeResponse } = await dispatchPlugin({
            app: {
              name: tool.name,
              avatar: tool.avatar,
              id: tool.id
            },
            userChatInput: '',
            customAppVariables: requestParams,
            checkIsStopping,
            lang,
            requestOrigin,
            mode,
            timezone,
            externalProvider,
            chatId,
            uid,
            runningAppInfo,
            runningUserInfo,
            retainDatasetCite,
            maxRunTimes,
            workflowDispatchDeep,
            variableState
          });

          return {
            response,
            usages,
            nodeResponse
          };
        } else {
          return {
            response: 'Invalid tool type'
          };
        }
      } catch (error) {
        return {
          response: `Tool error: ${getErrText(error)}`
        };
      }
    })();

    const formatNodeResponse = nodeResponse
      ? {
          ...nodeResponse,
          nodeId: callId,
          id: callId,
          runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
          totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0)
        }
      : undefined;

    return {
      response,
      usages,
      stop,
      nodeResponse: formatNodeResponse,
      capabilityAssistantResponses
    };
  };
};
