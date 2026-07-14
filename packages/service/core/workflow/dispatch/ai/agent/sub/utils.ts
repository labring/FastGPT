import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { DispatchSubAppResponse, GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import { getAgentRuntimeTools } from './tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchAgentModuleProps } from '..';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { parseJsonArgs } from '../../../../../ai/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { dispatchTool } from './tool';
import type { WorkflowResponseItemType } from '../../../type';
import { dispatchApp, dispatchPlugin } from './app';
import { SystemToolRepo } from '../../../../../app/tool/systemTool/systemTool.repo';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowNodeResponseWriter } from '../../../../../chat/nodeResponseStorage';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

/**
 * 收集 Agent 节点可用的 workflow runtime tools 和用户选择的子应用工具。
 * 新 agentLoop 入口不会在这里混入 plan/ask/sandbox 这类 provider internal tools。
 */
export const getSubapps = async ({
  tmbId,
  tools,
  lang
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
}): Promise<{
  completionTools: ChatCompletionTool[];
  subAppsMap: Map<string, SubAppRuntimeType>;
  promptToolReferenceInfoMap: Map<string, string>;
}> => {
  const completionTools: ChatCompletionTool[] = [];

  /* User tools */
  const subAppsMap = new Map<string, SubAppRuntimeType>();
  const promptToolReferenceInfoMap = new Map<string, string>();
  const formatTools = await getAgentRuntimeTools({
    tools,
    tmbId,
    lang
  });
  formatTools.forEach((tool) => {
    if (tool.promptReference) {
      promptToolReferenceInfoMap.set(tool.promptReference.id, tool.promptReference.name);
    }
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
    subAppsMap,
    promptToolReferenceInfoMap
  };
};

export type ToolDispatchContext = Pick<
  DispatchAgentModuleProps,
  | 'checkIsStopping'
  | 'chatConfig'
  | 'runningUserInfo'
  | 'runningAppInfo'
  | 'chatId'
  | 'responseChatItemId'
  | 'usageId'
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
  nodeResponseWriter?: WorkflowNodeResponseWriter;
  nodeResponseParentId?: string;
  systemPrompt?: string;
  getSubAppInfo: GetSubAppInfoFnType;
  getSubApp: (id: string) => SubAppRuntimeType | undefined;
  completionTools: ChatCompletionTool[];
  fileUrlMap?: Record<string, string>;
  streamResponseFn?: (args: WorkflowResponseItemType) => void | undefined;
};

/** 将工具参数中完整匹配的 Agent 文件 id 递归替换为真实 URL。 */
export const replaceAgentFileIdsWithUrls = <T>(value: T, fileUrlMap: Record<string, string>): T => {
  if (!value || Object.keys(fileUrlMap).length === 0) return value;

  const replaceValue = (input: unknown): unknown => {
    if (typeof input === 'string') return fileUrlMap[input] || input;
    if (Array.isArray(input)) return input.map(replaceValue);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input).map(([key, item]) => [key, replaceValue(item)])
      );
    }
    return input;
  };

  return replaceValue(value) as T;
};

const filterAgentWorkflowRuntimeParams = (params: Record<string, any>) => {
  const runtimeParams = { ...params };
  delete runtimeParams[NodeInputKeyEnum.forbidStream];
  return runtimeParams;
};

/** 兼容 ChatAgent 聚合配置和旧 Workflow Agent 拆分输入，统一生成知识库参数。 */
export const getAgentDatasetParams = (
  params: DispatchAgentModuleProps['params']
): AppFormEditFormType['dataset'] | undefined => {
  const datasetParams = params[NodeInputKeyEnum.datasetParams];
  if (datasetParams) return datasetParams;

  const datasets = params[NodeInputKeyEnum.datasetSelectList];
  if (!Array.isArray(datasets) || datasets.length === 0) return;

  return {
    datasets,
    similarity: params[NodeInputKeyEnum.datasetSimilarity],
    limit: params[NodeInputKeyEnum.datasetMaxTokens],
    searchMode: params[NodeInputKeyEnum.datasetSearchMode] || DatasetSearchModeEnum.embedding,
    embeddingWeight: params[NodeInputKeyEnum.datasetSearchEmbeddingWeight],
    usingReRank: params[NodeInputKeyEnum.datasetSearchUsingReRank],
    rerankModel: params[NodeInputKeyEnum.datasetSearchRerankModel],
    rerankWeight: params[NodeInputKeyEnum.datasetSearchRerankWeight],
    datasetSearchUsingExtensionQuery: params[NodeInputKeyEnum.datasetSearchUsingExtensionQuery],
    datasetSearchExtensionModel: params[NodeInputKeyEnum.datasetSearchExtensionModel],
    datasetSearchExtensionBg: params[NodeInputKeyEnum.datasetSearchExtensionBg],
    [NodeInputKeyEnum.authTmbId]: params[NodeInputKeyEnum.authTmbId]
  };
};

/**
 * 创建 workflow 工具执行器。
 * 该执行器只处理用户选择的 workflow runtime tools。
 * plan/ask/sandbox/readFile/datasetSearch 等 system tools 由 agentLoop provider 注入和执行，避免业务层重复分发。
 */
export const getExecuteTool = ({
  getSubAppInfo,
  getSubApp,
  fileUrlMap = {},
  checkIsStopping,
  runningUserInfo,
  runningAppInfo,
  chatId,
  responseChatItemId,
  uid,
  variableState,
  externalProvider,
  streamResponseFn,
  lang,
  requestOrigin,
  mode,
  timezone,
  retainDatasetCite,
  maxRunTimes,
  workflowDispatchDeep,
  nodeResponseWriter
}: ToolDispatchContext) => {
  /**
   * 执行单次工具调用，并补齐节点响应的 id、运行时间和计费信息。
   */
  return async ({
    callId,
    toolId,
    args,
    lastInteractive
  }: {
    callId: string;
    toolId: string;
    args: string;
    lastInteractive?: DispatchSubAppResponse['interactive'];
  }) => {
    const startTime = Date.now();

    const {
      response,
      assistantMessages,
      usages = [],
      interactive,
      stop = false,
      nodeResponse
    } = await (async (): Promise<{
      response: string;
      assistantMessages?: DispatchSubAppResponse['assistantMessages'];
      usages?: ChatNodeUsageType[];
      interactive?: DispatchSubAppResponse['interactive'];
      stop?: boolean;
      nodeResponse?: DispatchSubAppResponse['nodeResponse'];
    }> => {
      try {
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
        const requestParams = replaceAgentFileIdsWithUrls(
          {
            ...tool.params,
            ...toolCallParams
          },
          fileUrlMap
        );

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
          const { userChatInput, ...params } = filterAgentWorkflowRuntimeParams(requestParams);

          const { response, assistantMessages, usages, interactive, nodeResponse } =
            await dispatchApp({
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
              responseChatItemId,
              uid,
              runningAppInfo,
              runningUserInfo,
              retainDatasetCite,
              maxRunTimes,
              workflowDispatchDeep,
              nodeResponseWriter,
              nodeResponseParentId: callId,
              variableState,
              lastInteractive
            });

          return {
            response,
            assistantMessages,
            usages,
            interactive,
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
          const customAppVariables = filterAgentWorkflowRuntimeParams(requestParams);
          const { response, assistantMessages, usages, interactive, nodeResponse } =
            await dispatchPlugin({
              app: {
                name: tool.name,
                avatar: tool.avatar,
                id
              },
              userChatInput: '',
              customAppVariables,
              checkIsStopping,
              lang,
              requestOrigin,
              mode,
              timezone,
              externalProvider,
              chatId,
              responseChatItemId,
              uid,
              runningAppInfo,
              runningUserInfo,
              retainDatasetCite,
              maxRunTimes,
              workflowDispatchDeep,
              nodeResponseWriter,
              nodeResponseParentId: callId,
              variableState,
              lastInteractive
            });

          return {
            response,
            assistantMessages,
            usages,
            interactive,
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
      const childResponseCount =
        nodeResponse.childResponseCount ??
        (nodeResponse.childrenResponses?.length
          ? nodeResponse.childrenResponses.length
          : undefined);
      return {
        ...nodeResponse,
        moduleType: nodeResponse.moduleType || FlowNodeTypeEnum.tool,
        moduleName: nodeResponse.moduleName || subInfo.name || toolId,
        moduleLogo: nodeResponse.moduleLogo || subInfo.avatar,
        nodeId: callId,
        id: callId,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        totalPoints: usages?.reduce((sum, item) => sum + item.totalPoints, 0),
        ...(childResponseCount !== undefined ? { childResponseCount } : {})
      };
    })();

    return {
      response,
      assistantMessages,
      usages,
      interactive,
      stop,
      nodeResponse: formatNodeResponse
    };
  };
};
