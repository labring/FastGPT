import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentLoopRuntime } from '../../../../../ai/llm/agentLoop/interface';
import { getExecuteTool, type ToolDispatchContext } from '../sub/utils';
import type { WorkflowResponseType } from '../../../type';
import { createWorkflowAgentLoopToolCatalog } from './toolCatalog';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SandboxClient } from '../../../../../ai/sandbox/interface/runtime';
import type { UseUserContextResult } from './userContext';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  createAgentLoopCoreNodeRuntime,
  getAgentLoopCoreSystemToolInfo
} from '../../agentLoopCore/interface';
import { createWorkflowAgentToolProvider } from '../toolProvider';

type WorkflowAgentLoopRuntimeContext = ToolDispatchContext & {
  node: {
    nodeId: string;
    flowNodeType: FlowNodeTypeEnum;
  };
  currentFiles: UseUserContextResult['currentFiles'];
  sandboxClient?: SandboxClient;
};

type WorkflowAgentLoopRuntimeArtifacts = {
  assistantResponses: AIChatItemValueItemType[];
  nodeResponses: ChatHistoryItemResType[];
  setPlanToolName?: string;
  updatePlanToolName?: string;
  askToolName?: string;
};

/**
 * 将 workflow dispatch 上下文适配成通用 AgentLoopRuntime。
 * 这里集中处理工具目录、事件映射、usage 推送和运行详情收集，让 agentLoop 不依赖 workflow 结构。
 *
 * agentLoop 只认识模型、工具和事件；workflow 还需要额外维护：
 * 1. 前端流式事件：由 core runtime environment 转成 workflowStreamResponse。
 * 2. 聊天内容：assistantResponses 记录可展示/可持久化的交互内容。
 * 3. 运行详情：nodeResponses 平铺记录主模型、工具、plan、压缩模型调用的消耗和 requestId。
 */
export const createWorkflowAgentLoopRuntime = ({
  context,
  usagePush,
  workflowStreamResponse,
  assistantResponses = [],
  nodeResponses = [],
  appendNodeResponse,
  executeToolFactory = getExecuteTool
}: {
  context: WorkflowAgentLoopRuntimeContext;
  usagePush: (usages: ChatNodeUsageType[]) => void;
  workflowStreamResponse?: WorkflowResponseType;
  assistantResponses?: AIChatItemValueItemType[];
  nodeResponses?: ChatHistoryItemResType[];
  appendNodeResponse?: (nodeResponse: ChatHistoryItemResType) => void;
  executeToolFactory?: typeof getExecuteTool;
}): {
  runtime: AgentLoopRuntime<WorkflowInteractiveResponseType>;
  artifacts: WorkflowAgentLoopRuntimeArtifacts;
} => {
  // 工具目录只在 workflow adapter 层生成，agentLoop 后续只依赖通用 toolCatalog。
  const toolCatalog = createWorkflowAgentLoopToolCatalog({
    completionTools: context.completionTools
  });
  // artifacts 是本次 Agent 节点运行结束后要回写给 workflow/chat 层的结果容器。
  // assistantResponses 和 nodeResponses 允许外部传入，是为了继续复用已有数组并保持引用稳定。
  const artifacts: WorkflowAgentLoopRuntimeArtifacts = {
    assistantResponses,
    nodeResponses,
    setPlanToolName: toolCatalog.setPlanTool?.function.name,
    updatePlanToolName: toolCatalog.updatePlanTool?.function.name,
    askToolName: toolCatalog.askTool?.function.name
  };

  const getToolInfo = (name: string) => {
    const systemToolInfo = getAgentLoopCoreSystemToolInfo({
      name,
      lang: context.lang
    });
    if (systemToolInfo) {
      return {
        name: systemToolInfo.name,
        avatar: systemToolInfo.avatar
      };
    }

    const subInfo = context.getSubAppInfo(name);

    return {
      name: subInfo.name || name,
      avatar: subInfo.avatar
    };
  };
  // ToolProvider 暴露业务工具，并附带 readFile/datasetSearch 这类 system tool executor；
  // plan/ask/sandbox 仍由 runtime 配置决定是否注入，不混入业务 runtime tools。
  const toolProvider = createWorkflowAgentToolProvider({
    context,
    executeToolFactory
  });

  return {
    artifacts,
    runtime: createAgentLoopCoreNodeRuntime({
      teamId: context.runningUserInfo.teamId,
      environment: {
        node: context.node,
        workflowStreamResponse,
        streamReasoning: context.params.aiChatReasoning !== false,
        nodeResponses: artifacts.nodeResponses,
        appendNodeResponse,
        getToolInfo
      },
      llmParams: {
        model: context.params.model,
        reasoningEffort: context.params.aiChatReasoningEffort,
        userKey: context.externalProvider.openaiAccount,
        stream: context.stream,
        useVision: context.params.aiChatVision,
        useAudio: context.params.aiChatAudio,
        useVideo: context.params.aiChatVideo,
        extractFiles: context.params.aiChatExtractFiles
      },
      responseParams: {
        retainDatasetCite: context.retainDatasetCite
      },
      lang: context.lang,
      systemTools: {
        planEnabled: true,
        askEnabled: true,
        sandboxClient: context.sandboxClient,
        datasetSearch: toolProvider.datasetSearchExecutor
          ? {
              enabled: true,
              currentInputFiles: toolProvider.currentInputFiles,
              execute: toolProvider.datasetSearchExecutor
            }
          : undefined,
        readFile: toolProvider.readFileExecutor
          ? {
              enabled: true,
              maxFileAmount: toolProvider.readFileMaxFileAmount,
              execute: toolProvider.readFileExecutor
            }
          : undefined
      },
      checkIsStopping: context.checkIsStopping,
      toolRuntime: {
        toolProvider,
        batchToolSize: 5
      },
      usagePush
    }).runtime
  };
};
