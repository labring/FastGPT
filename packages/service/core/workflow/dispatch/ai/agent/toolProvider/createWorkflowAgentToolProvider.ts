import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreToolRunResult } from '../../agentLoopCore/interface';
import {
  createAgentLoopCoreReadFileExecutor,
  normalizeAgentLoopCoreDatasetSearchResult
} from '../../agentLoopCore/interface';
import { dispatchAgentDatasetSearch } from '../sub/dataset';
import { dispatchFileRead } from '../sub/file';
import { getAgentDatasetParams, getExecuteTool } from '../sub/utils';
import type { WorkflowAgentToolProvider, WorkflowAgentToolProviderContext } from './type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

/**
 * 创建 Workflow Agent 节点的工具 provider。
 *
 * Workflow Agent 的工具来源是 selectedTools 解析出来的 subApp/runtime tool。
 * provider 负责包装业务 runtime tools，并准备 readFile/datasetSearch system tool executor。
 * plan/ask/sandbox 仍由 runtime 配置决定是否注入，不混入业务 runtime tools。
 */
export const createWorkflowAgentToolProvider = ({
  context,
  executeToolFactory = getExecuteTool
}: {
  context: WorkflowAgentToolProviderContext;
  executeToolFactory?: typeof getExecuteTool;
}): WorkflowAgentToolProvider => {
  const executeTool = executeToolFactory(context);
  const datasetParams = getAgentDatasetParams(context.params);
  const datasetSearchExecutor: AgentLoopDatasetSearchExecutor | undefined = datasetParams?.datasets
    ?.length
    ? async ({ call }) => {
        const startTime = Date.now();
        const result = await dispatchAgentDatasetSearch({
          args: call.function.arguments,
          datasetParams,
          teamId: context.runningUserInfo.teamId,
          tmbId: context.runningUserInfo.tmbId,
          llmModel: context.params.model,
          userKey: context.externalProvider.openaiAccount
        });
        const usages = result.usages ?? [];
        const datasetSearchInfo = context.getSubAppInfo(SubAppIds.datasetSearch);

        return normalizeAgentLoopCoreDatasetSearchResult({
          callId: call.id,
          startTime,
          response: result.response,
          usages,
          nodeResponse: result.nodeResponse,
          fallback: {
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: datasetSearchInfo.name || SubAppIds.datasetSearch,
            moduleLogo: datasetSearchInfo.avatar
          }
        });
      }
    : undefined;
  const readFileExecutor = createAgentLoopCoreReadFileExecutor({
    enabled: Object.keys(context.filesMap).length > 0,
    resolveFiles: (ids) =>
      ids.map((id) => {
        const file = context.filesMap[id];

        return {
          id,
          ...(file?.name ? { name: file.name } : {}),
          url: file?.url || ''
        };
      }),
    execute: async ({ files }) =>
      dispatchFileRead({
        files,
        teamId: context.runningUserInfo.teamId,
        tmbId: context.runningUserInfo.tmbId,
        customPdfParse: context.chatConfig?.fileSelectConfig?.customPdfParse,
        usageId: context.usageId
      })
  });

  return {
    buildRuntimeTools: () => context.completionTools,
    getToolInfo: (name) => {
      const subApp = context.getSubApp(name);
      if (!subApp) return undefined;

      return {
        type: 'user',
        name: subApp.name,
        avatar: subApp.avatar,
        rawData: subApp
      };
    },
    executeTool: async ({
      call
    }): Promise<AgentLoopCoreToolRunResult<WorkflowInteractiveResponseType>> => {
      return executeTool({
        callId: call.id,
        toolId: call.function.name,
        args: call.function.arguments ?? ''
      });
    },
    executeInteractiveTool: async ({
      call,
      childrenResponse
    }): Promise<AgentLoopCoreToolRunResult<WorkflowInteractiveResponseType>> => {
      return executeTool({
        callId: call.id,
        toolId: call.function.name,
        args: call.function.arguments ?? '',
        lastInteractive: childrenResponse
      });
    },
    readFileExecutor,
    datasetSearchExecutor,
    currentInputFiles: context.currentFiles.map((file) => file.url)
  };
};
