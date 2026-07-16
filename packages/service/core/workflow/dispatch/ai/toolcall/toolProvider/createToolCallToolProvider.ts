import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopInteractiveToolExecuteParams } from '../../../../../ai/llm/agentLoop/interface';
import type { DispatchToolModuleProps } from '../type';
import { useToolCatalog } from '../hooks/useToolCatalog';
import type { ToolCallToolProvider } from './type';
import {
  createAgentLoopCoreReadFileExecutor,
  createAgentLoopCoreWorkflowSystemToolExecutor,
  createAgentLoopCoreWorkflowToolRunner,
  type CreateAgentLoopCoreWorkflowToolRunnerParams,
  type AgentLoopCoreToolRunFlowResponse
} from '../../agentLoopCore/interface';
import { runWorkflow } from '../../../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchReadFileTool, getToolCallFileUrl } from '../tools/file';

type CacheToolFlowResponse = (args: {
  callId: string;
  flowResponse?: AgentLoopCoreToolRunFlowResponse;
}) => void;

/**
 * 创建 ToolCall 节点的工具 provider。
 *
 * ToolCall 的工具来源是 workflow runtimeNodes/runtimeEdges；这里把工具目录、workflow tool runner
 * 和 readFile/datasetSearch system tool executor 组装成统一协议。
 * 后续 runAgentLoopCore 只需要消费 ToolProvider，不再关心工具来自 ToolCall 还是 Workflow Agent。
 */
export const createToolCallToolProvider = async ({
  messages,
  toolNodes,
  useAgentSandbox,
  lang,
  workflowProps,
  runtimeNodes,
  runtimeEdges,
  allFiles,
  fileUrlList,
  cacheToolFlowResponse
}: {
  messages: DispatchToolModuleProps['messages'];
  toolNodes: DispatchToolModuleProps['toolNodes'];
  useAgentSandbox?: boolean;
  lang: DispatchToolModuleProps['lang'];
  workflowProps: Omit<
    DispatchToolModuleProps,
    | 'messages'
    | 'toolNodes'
    | 'toolModel'
    | 'childrenInteractiveParams'
    | 'allFiles'
    | 'currentInputFiles'
  >;
  runtimeNodes: DispatchToolModuleProps['runtimeNodes'];
  runtimeEdges: DispatchToolModuleProps['runtimeEdges'];
  allFiles: DispatchToolModuleProps['allFiles'];
  fileUrlList?: string[];
  cacheToolFlowResponse: CacheToolFlowResponse;
}): Promise<ToolCallToolProvider> => {
  const { finalMessages, tools, getToolInfo } = await useToolCatalog({
    messages,
    toolNodes,
    useAgentSandbox,
    lang
  });
  const datasetSearchNodeIds = toolNodes
    .filter((toolNode) => toolNode.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
    .map((toolNode) => toolNode.nodeId);
  const runWorkflowTool: CreateAgentLoopCoreWorkflowToolRunnerParams<WorkflowInteractiveResponseType>['runWorkflowTool'] =
    async ({ runtimeNodes, runtimeEdges, lastInteractive }) => {
      const result = await runWorkflow({
        ...workflowProps,
        ...(lastInteractive ? { lastInteractive } : {}),
        runtimeNodes,
        runtimeEdges,
        isToolCall: true
      });

      return {
        flowResponses: result.flatNodeResponses ?? [],
        runtimeNodeResponseSummary: result.runtimeNodeResponseSummary,
        flowUsages: result.flowUsages,
        runTimes: result[DispatchNodeResponseKeyEnum.runTimes],
        assistantResponses: result[DispatchNodeResponseKeyEnum.assistantResponses],
        workflowInteractiveResponse: result.workflowInteractiveResponse,
        toolResponses: result[DispatchNodeResponseKeyEnum.toolResponse]
      };
    };
  const { runTool, runInteractiveTool } = createAgentLoopCoreWorkflowToolRunner({
    runtimeNodes,
    runtimeEdges,
    getToolInfo,
    runWorkflowTool,
    cacheToolFlowResponse
  });
  const readFileExecutor = createAgentLoopCoreReadFileExecutor({
    enabled: allFiles.size > 0,
    resolveFiles: (ids) =>
      ids.map((id) => {
        const file = allFiles.get(id);

        return {
          id,
          ...(file?.name ? { name: file.name } : {}),
          url: getToolCallFileUrl({
            id,
            allFiles,
            fileUrlList
          })
        };
      }),
    execute: async ({ callId, files }) => {
      const result = await dispatchReadFileTool({
        files,
        toolCallId: callId,
        teamId: workflowProps.runningUserInfo.teamId,
        tmbId: workflowProps.runningUserInfo.tmbId,
        customPdfParse: workflowProps.chatConfig?.fileSelectConfig?.customPdfParse,
        usageId: workflowProps.usageId
      });

      return {
        response: result.response,
        usages: result.usages,
        nodeResponse: result.flowResponse.flowResponses[0]
      };
    }
  });

  return {
    finalMessages,
    buildRuntimeTools: () => tools,
    getToolInfo,
    executeTool: runTool,
    executeInteractiveTool: (
      params: AgentLoopInteractiveToolExecuteParams<WorkflowInteractiveResponseType>
    ) => runInteractiveTool(params),
    readFileExecutor,
    datasetSearchExecutor:
      datasetSearchNodeIds.length > 0
        ? createAgentLoopCoreWorkflowSystemToolExecutor({
            runtimeNodes,
            runtimeEdges,
            entryNodeIds: datasetSearchNodeIds,
            runWorkflowTool,
            cacheToolFlowResponse
          })
        : undefined
  };
};
