import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { DispatchSubAppResponse, GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import { getAgentRuntimeTools } from './tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { datasetSearchTool } from './dataset/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { DispatchAgentModuleProps } from '..';
import { dispatchAgentDatasetSearch } from './dataset';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { parseJsonArgs } from '../../../../../ai/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { dispatchTool } from './tool';
import type { WorkflowResponseItemType } from '../../../type';
import { dispatchApp, dispatchPlugin } from './app';
import { SystemToolRepo } from '../../../../../app/tool/systemTool/systemTool.repo';

/**
 * 收集 Agent 节点可用的 workflow runtime tools 和用户选择的子应用工具。
 * 新 agentLoop 入口不会在这里混入 plan/ask/sandbox 这类 provider internal tools。
 */
export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  hasDataset
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  hasDataset?: boolean;
}): Promise<{
  completionTools: ChatCompletionTool[];
  subAppsMap: Map<string, SubAppRuntimeType>;
}> => {
  const completionTools: ChatCompletionTool[] = [];

  // Workflow built-in runtime tools
  {
    /* Dataset Search */
    if (hasDataset) {
      completionTools.push(datasetSearchTool);
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
  streamResponseFn?: (args: WorkflowResponseItemType) => void | undefined;
};

/**
 * 创建 workflow 工具执行器。
 * 该执行器只处理 workflow runtime tools：知识库搜索和用户子应用。
 * plan/ask/sandbox/readFile 等 internal tools 由 agentLoop provider 注入和执行，避免业务层重复分发。
 */
export const getExecuteTool = ({
  getSubAppInfo,
  getSubApp,
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
        if (toolId === SubAppIds.datasetSearch) {
          const result = await dispatchAgentDatasetSearch({
            args: args,
            datasetParams,
            teamId: runningUserInfo.teamId,
            tmbId: runningUserInfo.tmbId,
            llmModel: model,
            userKey: externalProvider.openaiAccount
          });

          return {
            response: result.response,
            usages: result.usages,
            nodeResponse: result.nodeResponse
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
        } else if (tool.type === 'toolWorkflow' || tool.type === 'commercialTool') {
          const id = await (async () => {
            if (tool.type === 'toolWorkflow') {
              return tool.id;
            }

            const systemToolRepo = SystemToolRepo.getInstance();
            const trueId = (
              await systemToolRepo.getSystemToolDetail({
                pluginId: `commercial-${tool.id}`
              })
            ).associatedPluginId;

            if (!trueId) {
              throw new Error('No associated plugin found');
            }
            return trueId;
          })();
          const { response, usages, nodeResponse } = await dispatchPlugin({
            app: {
              name: tool.name,
              avatar: tool.avatar,
              id
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

    const formatNodeResponse = (() => {
      if (!nodeResponse) return undefined;

      const subInfo = getSubAppInfo(toolId);
      const childTotalPoints = (nodeResponse.childrenResponses || []).reduce(
        (sum, item) => sum + (item.totalPoints || 0),
        0
      );
      return {
        ...nodeResponse,
        moduleType: nodeResponse.moduleType || FlowNodeTypeEnum.tool,
        moduleName: nodeResponse.moduleName || subInfo.name || toolId,
        moduleLogo: nodeResponse.moduleLogo || subInfo.avatar,
        nodeId: callId,
        id: callId,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0),
        ...(childTotalPoints > 0 ? { childTotalPoints } : {})
      };
    })();

    return {
      response,
      usages,
      stop,
      nodeResponse: formatNodeResponse
    };
  };
};
