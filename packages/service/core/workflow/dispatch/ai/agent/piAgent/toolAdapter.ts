import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import {
  SANDBOX_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SandboxShellToolSchema,
  SandboxGetFileUrlToolSchema
} from '@fastgpt/global/core/ai/sandbox/constants';
import { ReadFileToolSchema } from '../sub/file/utils';
import { DatasetSearchToolSchema } from '../sub/dataset/utils';
import { dispatchFileRead } from '../sub/file';
import { dispatchAgentDatasetSearch } from '../sub/dataset';
import { dispatchSandboxShell, dispatchSandboxGetFileUrl } from '../sub/sandbox';
import { dispatchTool } from '../sub/tool';
import { dispatchApp, dispatchPlugin } from '../sub/app';
import { parseJsonArgs } from '../../../../../ai/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import type { CapabilityToolCallHandlerType } from '../capability/type';
import type { DispatchAgentModuleProps } from '..';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

type AgentTool = import('@mariozechner/pi-agent-core').AgentTool<any>;

// Flatten context for tool dispatch (avoids NodeInputKeyEnum computed-key Pick issues)
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
  | 'workflowStreamResponse'
  | 'lang'
  | 'requestOrigin'
  | 'mode'
  | 'timezone'
  | 'retainDatasetCite'
  | 'maxRunTimes'
  | 'workflowDispatchDeep'
  | 'usagePush'
> & {
  model: string;
  datasetParams?: AppFormEditFormType['dataset'];
};

export async function buildAgentTools({
  completionTools,
  ctx,
  filesMap,
  getSubApp,
  getSubAppInfo,
  capabilityToolCallHandler,
  nodeResponses
}: {
  completionTools: ChatCompletionTool[];
  ctx: ToolDispatchContext;
  filesMap: Record<string, string>;
  getSubApp: (id: string) => SubAppRuntimeType | undefined;
  getSubAppInfo: GetSubAppInfoFnType;
  capabilityToolCallHandler?: CapabilityToolCallHandlerType;
  nodeResponses: ChatHistoryItemResType[];
}): Promise<AgentTool[]> {
  const { Type } = await import('@mariozechner/pi-ai');

  const {
    checkIsStopping,
    chatConfig,
    runningUserInfo,
    runningAppInfo,
    chatId,
    uid,
    variables,
    externalProvider,
    workflowStreamResponse,
    lang,
    requestOrigin,
    mode,
    timezone,
    retainDatasetCite,
    maxRunTimes,
    workflowDispatchDeep,
    usagePush,
    model,
    datasetParams
  } = ctx;

  const tools: AgentTool[] = [];

  for (const tool of completionTools) {
    const toolId = tool.function.name;

    // pi-agent-core manages multi-turn reasoning; skip the plan tool
    if (toolId === SubAppIds.plan) continue;

    const execute = async (
      callId: string,
      args: Record<string, any>,
      _signal?: AbortSignal
    ): Promise<{ content: { type: 'text'; text: string }[]; details: Record<string, unknown> }> => {
      const argStr = JSON.stringify(args);

      try {
        const { response, usages = [] } = await (async (): Promise<{
          response: string;
          usages?: any[];
        }> => {
          if (toolId === SubAppIds.fileRead) {
            const toolParams = ReadFileToolSchema.safeParse(args);
            if (!toolParams.success) return { response: toolParams.error.message };
            const files = toolParams.data.file_indexes.map((index) => ({
              index,
              url: filesMap[index]
            }));
            const result = await dispatchFileRead({
              files,
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
              model,
              userKey: externalProvider.openaiAccount as OpenaiAccountType | undefined
            });
            if (result.nodeResponse) nodeResponses.push(result.nodeResponse);
            return { response: result.response, usages: result.usages };
          }

          if (toolId === SubAppIds.datasetSearch) {
            const toolParams = DatasetSearchToolSchema.safeParse(args);
            if (!toolParams.success) return { response: toolParams.error.message };
            if (!datasetParams || datasetParams.datasets.length === 0) {
              return { response: 'No dataset selected' };
            }
            const result = await dispatchAgentDatasetSearch({
              query: toolParams.data.query,
              config: {
                datasets: datasetParams.datasets,
                similarity: datasetParams.similarity || 0.4,
                maxTokens: datasetParams.limit || 5000,
                searchMode: datasetParams.searchMode,
                embeddingWeight: datasetParams.embeddingWeight,
                usingReRank: datasetParams.usingReRank ?? false,
                rerankModel: datasetParams.rerankModel,
                rerankWeight: datasetParams.rerankWeight || 0.5,
                usingExtensionQuery: datasetParams.datasetSearchUsingExtensionQuery ?? false,
                extensionModel: datasetParams.datasetSearchExtensionModel,
                extensionBg: datasetParams.datasetSearchExtensionBg
              },
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              llmModel: model
            });
            if (result.nodeResponse) nodeResponses.push(result.nodeResponse);
            return { response: result.response, usages: result.usages };
          }

          if (toolId === SANDBOX_TOOL_NAME) {
            const toolParams = SandboxShellToolSchema.safeParse(args);
            if (!toolParams.success) return { response: toolParams.error.message };
            const result = await dispatchSandboxShell({
              command: toolParams.data.command,
              timeout: toolParams.data.timeout,
              appId: runningAppInfo.id,
              userId: uid,
              chatId,
              lang
            });
            nodeResponses.push(result.nodeResponse);
            return { response: result.response, usages: result.usages };
          }

          if (toolId === SANDBOX_GET_FILE_URL_TOOL_NAME) {
            const toolParams = SandboxGetFileUrlToolSchema.safeParse(args);
            if (!toolParams.success) return { response: toolParams.error.message };
            const result = await dispatchSandboxGetFileUrl({
              paths: toolParams.data.paths,
              appId: runningAppInfo.id,
              userId: uid,
              chatId,
              lang
            });
            nodeResponses.push(result.nodeResponse);
            return { response: result.response, usages: result.usages };
          }

          // Capability tools (e.g. sandbox skills)
          const capResult = await capabilityToolCallHandler?.(toolId, argStr, callId);
          if (capResult != null) {
            const subInfo = getSubAppInfo(toolId);
            nodeResponses.push({
              nodeId: callId,
              id: callId,
              moduleType: FlowNodeTypeEnum.tool,
              moduleName: subInfo.name,
              moduleLogo: subInfo.avatar,
              toolInput: parseJsonArgs(argStr),
              toolRes: capResult.response
            });
            if (capResult.usages?.length) usagePush(capResult.usages);
            return { response: capResult.response, usages: capResult.usages };
          }

          // User sub-apps
          const subApp = getSubApp(toolId);
          if (!subApp) return { response: `Can't find the tool ${toolId}` };

          const requestParams = { ...subApp.params, ...args };

          if (subApp.type === 'tool') {
            const { response, usages, runningTime, toolParams, result } = await dispatchTool({
              tool: {
                name: subApp.name,
                version: subApp.version,
                toolConfig: subApp.toolConfig
              },
              params: requestParams,
              runningUserInfo,
              runningAppInfo,
              chatId,
              uid,
              variables,
              workflowStreamResponse
            });
            nodeResponses.push({
              nodeId: callId,
              id: callId,
              runningTime,
              moduleType: FlowNodeTypeEnum.tool,
              moduleName: subApp.name,
              moduleLogo: subApp.avatar,
              toolInput: toolParams,
              toolRes: result || response,
              totalPoints: usages?.reduce((sum: number, item: any) => sum + item.totalPoints, 0)
            });
            return { response, usages };
          }

          if (subApp.type === 'workflow') {
            const { userChatInput, ...params } = requestParams;
            const { response, runningTime, usages } = await dispatchApp({
              appId: subApp.id,
              userChatInput: userChatInput ?? '',
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
            nodeResponses.push({
              nodeId: callId,
              id: callId,
              runningTime,
              moduleType: FlowNodeTypeEnum.appModule,
              moduleName: subApp.name,
              moduleLogo: subApp.avatar,
              toolInput: requestParams,
              toolRes: response,
              totalPoints: usages?.reduce((sum: number, item: any) => sum + item.totalPoints, 0)
            });
            return { response, usages };
          }

          if (subApp.type === 'toolWorkflow') {
            const { response, result, runningTime, usages } = await dispatchPlugin({
              appId: subApp.id,
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
            nodeResponses.push({
              nodeId: callId,
              id: callId,
              runningTime,
              moduleType: FlowNodeTypeEnum.pluginModule,
              moduleName: subApp.name,
              moduleLogo: subApp.avatar,
              toolInput: requestParams,
              toolRes: result,
              totalPoints: usages?.reduce((sum: number, item: any) => sum + item.totalPoints, 0)
            });
            return { response, usages };
          }

          return { response: 'Invalid tool type' };
        })();

        if (usages && usages.length > 0) usagePush(usages);

        // SSE tool response
        workflowStreamResponse?.({
          id: callId,
          event: SseResponseEventEnum.toolResponse,
          data: { tool: { response } }
        });

        return { content: [{ type: 'text' as const, text: response }], details: {} };
      } catch (error) {
        const errText = `Tool error: ${getErrText(error)}`;
        return { content: [{ type: 'text' as const, text: errText }], details: {} };
      }
    };

    // Wrap execute to also emit SSE toolCall event before execution
    const wrappedExecute = async (
      callId: string,
      args: Record<string, any>,
      signal?: AbortSignal
    ) => {
      const subAppInfo = getSubAppInfo(toolId);
      workflowStreamResponse?.({
        id: callId,
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: callId,
            toolName: subAppInfo?.name || toolId,
            toolAvatar: subAppInfo?.avatar || '',
            functionName: toolId,
            params: JSON.stringify(args)
          }
        }
      });
      return execute(callId, args, signal);
    };

    tools.push({
      name: toolId,
      label: tool.function.name,
      description: tool.function.description || '',
      // Convert JSON Schema to TypeBox using Type.Unsafe
      parameters: Type.Unsafe<any>((tool.function.parameters as Record<string, unknown>) ?? {}),
      execute: wrappedExecute
    });
  }

  return tools;
}
