import { createWorkflowToolInteractive } from '../../agentLoopCore/adapter/interactive/child';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getChatItemTextContent } from '@fastgpt/global/core/chat/utils';
import type { AgentLoopDatasetSearchExecutor } from '../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreToolRunResult } from '../../agentLoopCore/interface';
import {
  createAgentLoopCoreReadFileExecutor,
  normalizeAgentLoopCoreDatasetSearchResult
} from '../../agentLoopCore/interface';
import { dispatchAgentDatasetSearch } from '../sub/dataset';
import { dispatchWorkflowReadFiles } from '../../readFiles';
import { getAgentDatasetParams, getExecuteTool } from '../sub/utils';
import type { WorkflowAgentToolProvider, WorkflowAgentToolProviderContext } from './type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getWorkflowFileMaxAmount } from '../../../../utils/context';

/**
 * 创建 Workflow Agent 节点的工具 provider。
 *
 * Workflow Agent 的工具来源是 selectedTools 解析出来的 subApp/runtime tool。
 * provider 负责包装业务 runtime tools，并准备 readFile/datasetSearch system tool executor。
 * plan/ask/sandbox 仍由 runtime 配置决定是否注入，不混入业务 runtime tools。
 */
export const createWorkflowAgentToolProvider = ({
  context,
  onToolResult,
  executeToolFactory = getExecuteTool
}: {
  context: WorkflowAgentToolProviderContext;
  executeToolFactory?: typeof getExecuteTool;
  onToolResult?: (result: AgentLoopCoreToolRunResult<WorkflowInteractiveResponseType>) => void;
}): WorkflowAgentToolProvider => {
  const executeTool = executeToolFactory(context);
  const datasetParams = getAgentDatasetParams(context.params);
  // 用户原始问题（文本部分）。Agent 生成的检索词往往已把别名改写成标准词
  // （例：问题「枕瓜排骨汤」→ 检索词「冬瓜排骨汤的做法」），同义词映射装饰需要
  // 原始问题才能把「问题原词 → 标准词」对齐到命中分块。
  // 来源取节点输入 userChatInput（ask 恢复时它仍是原始问题，context.query 则是
  // 用户对交互的回答），并并入当前 query 文本覆盖聊天入口的整条消息；两者相同则去重。
  const userRawQuery = [context.params.userChatInput, getChatItemTextContent(context.query)]
    .map((text) => text?.trim())
    .filter((text): text is string => !!text)
    .filter((text, index, list) => list.indexOf(text) === index)
    .join('\n');
  const datasetSearchExecutor: AgentLoopDatasetSearchExecutor | undefined = datasetParams?.datasets
    ?.length
    ? async ({ call }) => {
        const startTime = Date.now();
        const result = await dispatchAgentDatasetSearch({
          args: call.function.arguments,
          datasetParams,
          appTeamId: context.runningAppInfo?.teamId,
          teamId: context.runningUserInfo.teamId,
          tmbId: context.runningUserInfo.tmbId,
          llmModel: context.modelData,
          userKey: context.externalProvider.openaiAccount,
          userQuery: userRawQuery
        });
        onToolResult?.({ response: result.response, nodeSummary: result.nodeSummary });
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
  const readFileMaxFileAmount = getWorkflowFileMaxAmount();
  const readFileExecutor = createAgentLoopCoreReadFileExecutor({
    enabled: true,
    execute: async ({ files }) =>
      dispatchWorkflowReadFiles({
        files,
        teamId: context.runningUserInfo.teamId,
        tmbId: context.runningUserInfo.tmbId,
        customPdfParse: context.chatConfig?.fileSelectConfig?.customPdfParse,
        usageId: context.usageId,
        maxFileAmount: readFileMaxFileAmount
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
      const result = await executeTool({
        callId: call.id,
        toolId: call.function.name,
        args: call.function.arguments ?? ''
      });
      return {
        ...result,
        interactive: createWorkflowToolInteractive({
          interactive: result.interactive,
          toolCallId: call.id
        })
      };
    },
    executeInteractiveTool: async ({
      call,
      childrenResponse
    }): Promise<AgentLoopCoreToolRunResult<WorkflowInteractiveResponseType>> => {
      const result = await executeTool({
        callId: call.id,
        toolId: call.function.name,
        args: call.function.arguments ?? '',
        lastInteractive: childrenResponse
      });
      return {
        ...result,
        interactive: createWorkflowToolInteractive({
          interactive: result.interactive,
          toolCallId: call.id
        })
      };
    },
    readFileExecutor,
    readFileMaxFileAmount,
    datasetSearchExecutor,
    currentInputFiles: context.currentFiles.map((file) => file.url)
  };
};
