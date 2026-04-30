import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { DispatchSubAppResponse, GetSubAppInfoFnType, SubAppRuntimeType } from './type';
import { getAgentRuntimeTools } from './sub/tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { readFileTool, ReadFileToolSchema } from './sub/file/utils';
import { PlanAgentParamsSchema, PlanAgentTool } from './sub/plan/constants';
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
import type { DispatchPlanAgentResponse } from './sub/plan';
import { dispatchPlanAgent } from './sub/plan';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { dispatchTool } from './sub/tool';
import type { WorkflowResponseItemType } from '../../type';
import { dispatchApp, dispatchPlugin } from './sub/app';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  getPlanTool,
  hasDataset,
  hasFiles,
  useAgentSandbox,
  extraTools
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  getPlanTool?: Boolean;
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
    /* Plan */
    if (getPlanTool) {
      completionTools.push(PlanAgentTool);
    }
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
  | 'variables'
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
export const getExecuteTool = ({
  systemPrompt,
  getSubAppInfo,
  getSubApp,
  completionTools,
  filesMap,
  capabilityToolCallHandler,
  checkIsStopping,
  chatConfig,
  runningUserInfo,
  runningAppInfo,
  chatId,
  uid,
  variables,
  externalProvider,
  stream,
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
  return async ({ callId, toolId, args }: { callId: string; toolId: string; args: string }) => {
    let planResult: DispatchPlanAgentResponse | undefined;
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
        if (toolId === SubAppIds.plan) {
          try {
            const toolArgs = await PlanAgentParamsSchema.safeParseAsync(parseJsonArgs(args));

            if (!toolArgs.success) {
              return {
                response: 'Tool arguments is not valid'
              };
            }

            // plan: 1,3 场景
            planResult = await dispatchPlanAgent({
              checkIsStopping,
              completionTools,
              getSubAppInfo,
              systemPrompt,
              model,
              stream,
              mode: 'initial',
              ...toolArgs.data,
              planId: callId
            });

            return {
              response: '',
              stop: true
            };
          } catch (error) {
            getLogger(LogCategories.MODULE.AI.AGENT).error('dispatchPlanAgent error', { error });
            return {
              response: `Plan error: ${getErrText(error)}`,
              stop: false
            };
          }
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
            variables,
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
            runningAppInfo,
            runningUserInfo,
            retainDatasetCite,
            maxRunTimes,
            workflowDispatchDeep,
            variables
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
            runningAppInfo,
            runningUserInfo,
            retainDatasetCite,
            maxRunTimes,
            workflowDispatchDeep,
            variables
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
      planResult,
      capabilityAssistantResponses
    };
  };
};
