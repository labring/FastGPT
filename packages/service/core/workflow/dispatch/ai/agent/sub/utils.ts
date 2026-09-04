import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { AgentToolType } from '@fastgpt/global/core/app/tool/type';
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
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { mergeToolRuntimeParams } from '@fastgpt/global/core/app/tool/runtime';

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
  tools: AgentToolType[];
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
      // 兼容旧版 PromptEditor 持久化的原始工具 ID。
      promptToolReferenceInfoMap.set(
        tool.promptReference.legacyId || tool.promptReference.id,
        tool.promptReference.name
      );
    }
    completionTools.push(tool.requestSchema);
    subAppsMap.set(tool.id, {
      type: tool.type,
      id: tool.id,
      name: tool.name,
      avatar: tool.avatar,
      version: tool.version,
      toolConfig: tool.toolConfig,
      inputs: tool.inputs,
      agentGeneratedInputKeys: tool.agentGeneratedInputKeys,
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
  | 'nodeResponseSink'
> & {
  modelData: import('@fastgpt/global/core/ai/model.schema').LLMSystemModelDataType;
  nodeResponseParentId?: string;
  systemPrompt?: string;
  getSubAppInfo: GetSubAppInfoFnType;
  getSubApp: (id: string) => SubAppRuntimeType | undefined;
  completionTools: ChatCompletionTool[];
  streamResponseFn?: (args: WorkflowResponseItemType) => void | undefined;
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
    rerankModelId: params[NodeInputKeyEnum.datasetSearchRerankModelId],
    rerankModel: params[NodeInputKeyEnum.datasetSearchRerankModel],
    rerankWeight: params[NodeInputKeyEnum.datasetSearchRerankWeight],
    datasetSearchUsingExtensionQuery: params[NodeInputKeyEnum.datasetSearchUsingExtensionQuery],
    datasetSearchExtensionModelId: params[NodeInputKeyEnum.datasetSearchExtensionModelId],
    datasetSearchExtensionModel: params[NodeInputKeyEnum.datasetSearchExtensionModel],
    datasetSearchExtensionBg: params[NodeInputKeyEnum.datasetSearchExtensionBg],
    collectionFilterMatch: params[NodeInputKeyEnum.collectionFilterMatch],
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
  checkIsStopping,
  runningUserInfo,
  runningAppInfo,
  chatId,
  responseChatItemId,
  uid,
  variableState,
  externalProvider,
  lang,
  requestOrigin,
  mode,
  timezone,
  retainDatasetCite,
  maxRunTimes,
  workflowDispatchDeep,
  nodeResponseSink
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
      usages = [],
      interactive,
      stop = false,
      nodeResponse,
      errorMessage
    } = await (async (): Promise<{
      response: string;
      usages?: ChatNodeUsageType[];
      interactive?: DispatchSubAppResponse['interactive'];
      stop?: boolean;
      errorMessage?: string;
      nodeResponse?: DispatchSubAppResponse['nodeResponse'];
    }> => {
      try {
        // User Sub App
        const tool = getSubApp(toolId);
        if (!tool) {
          const response = `Can't find the tool ${toolId}`;
          return {
            response,
            errorMessage: response,
            usages: []
          };
        }

        // Get params
        const toolCallParams = parseJsonArgs(args);
        if (args && !toolCallParams) {
          const response = 'Params is not object';
          return {
            response,
            errorMessage: response
          };
        }
        const requestParams = mergeToolRuntimeParams({
          agentGeneratedKeys: tool.agentGeneratedInputKeys ?? [],
          fixedInputBindings: tool.params ?? {},
          aiParams: toolCallParams ?? {}
        });

        if (tool.type === 'tool') {
          const { response, usages, nodeResponse, errorMessage } = await dispatchTool({
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
            // Agent 统一负责外层流输出，子工具不得绕过 Agent 直接写入响应流。
            workflowStreamResponse: undefined
          });

          return {
            response,
            usages,
            nodeResponse,
            errorMessage
          };
        } else if (tool.type === 'workflow') {
          const { userChatInput, ...params } = filterAgentWorkflowRuntimeParams(requestParams);

          const { response, usages, interactive, nodeResponse, errorMessage } = await dispatchApp({
            app: {
              name: tool.name,
              avatar: tool.avatar,
              id: tool.id,
              version: tool.version
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
            nodeResponseSink,
            nodeResponseParentId: callId,
            variableState,
            lastInteractive
          });

          return {
            response,
            usages,
            interactive,
            nodeResponse,
            errorMessage
          };
        } else if (tool.type === 'toolWorkflow' || tool.type === 'commercialTool') {
          const { id, systemToolId } = await (async () => {
            if (tool.type === 'toolWorkflow') {
              return {
                id: tool.id,
                systemToolId: undefined
              };
            }

            const systemToolRepo = SystemToolRepo.getInstance();
            const systemToolId = `commercial-${tool.id}`;
            const trueId = (
              await systemToolRepo.getSystemToolDetail({
                pluginId: systemToolId,
                version: tool.version || undefined
              })
            ).associatedPluginId;

            if (!trueId) {
              throw new Error('No associated plugin found');
            }
            return {
              id: trueId,
              systemToolId
            };
          })();
          const customAppVariables = filterAgentWorkflowRuntimeParams(requestParams);
          const { response, usages, interactive, nodeResponse, errorMessage } =
            await dispatchPlugin({
              app: {
                name: tool.name,
                avatar: tool.avatar,
                id,
                version: tool.version,
                ...(systemToolId ? { systemToolId } : {})
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
              nodeResponseSink,
              nodeResponseParentId: callId,
              variableState,
              lastInteractive
            });

          return {
            response,
            usages,
            interactive,
            nodeResponse,
            errorMessage
          };
        } else {
          const response = 'Invalid tool type';
          return {
            response,
            errorMessage: response
          };
        }
      } catch (error) {
        const response = `Tool error: ${getErrText(error)}`;
        return {
          response,
          errorMessage: response
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
      usages,
      interactive,
      stop,
      ...(errorMessage ? { errorMessage } : {}),
      nodeResponse: formatNodeResponse
    };
  };
};
