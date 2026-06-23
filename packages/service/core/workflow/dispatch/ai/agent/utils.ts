import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import type { DispatchSubAppResponse, GetSubAppInfoFnType, SubAppRuntimeType } from './type';
import { getAgentRuntimeTools } from './sub/tool/utils';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { readFileTool, ReadFileToolSchema } from './sub/file/utils';
import { datasetSearchTool } from './sub/dataset/utils';
import { SANDBOX_TOOLS, sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/tools';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { dispatchFileRead } from './sub/file';
import type { DispatchAgentModuleProps } from '.';
import { dispatchAgentDatasetSearch } from './sub/dataset';
import { dispatchSandboxTool } from './sub/sandbox';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { parseJsonArgs } from '../../../../ai/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { dispatchTool } from './sub/tool';
import type { WorkflowResponseItemType } from '../../type';
import { dispatchApp, dispatchPlugin } from './sub/app';
import type { SandboxClient } from '../../../../ai/sandbox/service/runtime';
import { SystemToolRepo } from '../../../../app/tool/systemTool/systemTool.repo';
import type { WorkflowNodeResponseWriter } from '../../../../chat/nodeResponseStorage';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

/**
 * 收集 Agent 节点可用的系统工具和用户选择的子应用工具。
 * completionTools/subAppsMap 面向 runtime；promptToolReferenceInfoMap 只用于解析 prompt 中的
 * {{@toolId@}} 展示名，不参与工具展开和执行。
 */
export const getSubapps = async ({
  tmbId,
  tools,
  lang,
  hasDataset,
  hasFiles,
  useAgentSandbox
}: {
  tmbId: string;
  tools: SkillToolType[];
  lang?: localeType;
  hasDataset?: boolean;
  hasFiles: boolean;
  useAgentSandbox?: boolean;
}): Promise<{
  completionTools: ChatCompletionTool[];
  subAppsMap: Map<string, SubAppRuntimeType>;
  promptToolReferenceInfoMap: Map<string, string>;
}> => {
  const completionTools: ChatCompletionTool[] = [];
  const subAppsMap = new Map<string, SubAppRuntimeType>();
  const promptToolReferenceInfoMap = new Map<string, string>();

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
    if (useAgentSandbox) {
      completionTools.push(...SANDBOX_TOOLS);
    }
  }

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
  filesMap: Record<string, string>;
  sandboxClient?: SandboxClient;
  streamResponseFn?: (args: WorkflowResponseItemType) => void | undefined;
};

/**
 * 将工具参数中完整匹配的 Agent 文件 id 替换成真实 URL。
 *
 * LLM 有时会把文件清单里的 `<id>` 填到用户工具参数中；这些 id 只对 FastGPT
 * 内置 read_files 有意义，普通工具更需要可访问链接。这里只替换完整字符串，
 * 不处理长文本里的局部命中，避免误改业务字段。
 */
export const replaceAgentFileIdsWithUrls = <T>(value: T, fileUrlMap: Record<string, string>): T => {
  if (!value || Object.keys(fileUrlMap).length === 0) return value;

  const replaceValue = (input: unknown): unknown => {
    if (typeof input === 'string') {
      return fileUrlMap[input] || input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => replaceValue(item));
    }

    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input).map(([key, item]) => [key, replaceValue(item)])
      );
    }

    return input;
  };

  return replaceValue(value) as T;
};

/**
 * 统一 Agent 的知识库配置来源。
 *
 * ChatAgent 保存的是 agent_datasetParams；Workflow Agent 节点模板保存的是
 * datasets/similarity/authTmbId 等独立输入。runtime 内部收敛成 datasetParams，
 * 保证上下文提示、工具暴露和真实检索使用同一组知识库权限配置。
 */
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
 * 该执行器屏蔽工具来源差异，将沙盒、文件读取、知识库搜索和用户子应用统一成 agentLoop 可消费的工具结果。
 */
export const getExecuteTool = ({
  getSubAppInfo,
  getSubApp,
  fileUrlMap = {},
  filesMap,
  sandboxClient,
  checkIsStopping,
  chatConfig,
  runningUserInfo,
  runningAppInfo,
  chatId,
  responseChatItemId,
  usageId,
  uid,
  variableState,
  externalProvider,
  streamResponseFn,
  params,
  lang,
  requestOrigin,
  mode,
  timezone,
  retainDatasetCite,
  maxRunTimes,
  workflowDispatchDeep,
  nodeResponseWriter
}: ToolDispatchContext) => {
  const { model } = params;
  const datasetParams = getAgentDatasetParams(params);

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
        if (toolId in sandboxToolMap) {
          const result = await dispatchSandboxTool({
            toolName: toolId,
            rawArgs: args,
            appId: runningAppInfo.id,
            userId: uid,
            chatId,
            sandboxId: runningAppInfo.sandboxId,
            lang,
            sandboxClient
          });

          return {
            response: result.response,
            usages: result.usages,
            nodeResponse: result.nodeResponse
          };
        }

        if (toolId === SubAppIds.readFiles) {
          const rawArgs = parseJsonArgs(args);
          const toolParams = ReadFileToolSchema.safeParse(rawArgs);
          if (!toolParams.success) {
            return {
              response: toolParams.error.message,
              usages: []
            };
          }
          const ids = toolParams.data.ids;

          const files = ids.map((id) => ({
            id,
            url: filesMap[id]
          }));
          const result = await dispatchFileRead({
            files,
            teamId: runningUserInfo.teamId,
            tmbId: runningUserInfo.tmbId,
            customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
            usageId
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
            responseChatItemId,
            uid,
            runningAppInfo,
            runningUserInfo,
            retainDatasetCite,
            maxRunTimes,
            workflowDispatchDeep,
            nodeResponseWriter,
            nodeResponseParentId: callId,
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
            } else {
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
            }
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
            responseChatItemId,
            uid,
            runningAppInfo,
            runningUserInfo,
            retainDatasetCite,
            maxRunTimes,
            workflowDispatchDeep,
            nodeResponseWriter,
            nodeResponseParentId: callId,
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
      stop,
      nodeResponse: formatNodeResponse
    };
  };
};
