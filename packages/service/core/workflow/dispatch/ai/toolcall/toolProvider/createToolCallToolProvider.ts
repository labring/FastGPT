import { createWorkflowToolInteractive } from '../../agentLoopCore/adapter/interactive/child';
import { createWorkflowRuntimeSummary } from '../../../utils/summary';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { AgentLoopInteractiveToolExecuteParams } from '../../../../../ai/llm/agentLoop/interface';
import type { DispatchToolModuleProps } from '../type';
import { useToolCatalog } from '../hooks/useToolCatalog';
import type { ToolCallToolProvider } from './type';
import {
  createAgentLoopCoreReadFileExecutor,
  createAgentLoopCoreWorkflowSystemToolExecutor,
  createAgentLoopCoreWorkflowToolRunner,
  type CreateAgentLoopCoreWorkflowToolRunnerParams
} from '../../agentLoopCore/interface';
import { runWorkflow } from '../../../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchWorkflowReadFiles } from '../../readFiles';
import { getWorkflowContext, runWithContext } from '../../../context';
import type { DispatchFlowResponse } from '../../../type';
import { WorkflowRunStateSnapshot } from '../../../utils/containerRunState';

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
  onWorkflowRuntimeSummary
}: {
  messages: DispatchToolModuleProps['messages'];
  toolNodes: DispatchToolModuleProps['toolNodes'];
  useAgentSandbox?: boolean;
  lang: DispatchToolModuleProps['lang'];
  workflowProps: Omit<
    DispatchToolModuleProps,
    'messages' | 'toolNodes' | 'toolModel' | 'childrenInteractiveParams' | 'currentInputFiles'
  >;
  runtimeNodes: DispatchToolModuleProps['runtimeNodes'];
  runtimeEdges: DispatchToolModuleProps['runtimeEdges'];
  onWorkflowRuntimeSummary?: (summary?: DispatchFlowResponse['workflowRuntimeSummary']) => void;
}): Promise<ToolCallToolProvider> => {
  const memoryContext = getWorkflowContext().memoryContext;
  const { finalMessages, tools, getToolInfo } = await useToolCatalog({
    messages,
    toolNodes,
    useAgentSandbox,
    lang
  });
  const datasetSearchNodeIds = toolNodes
    .filter((toolNode) => toolNode.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
    .map((toolNode) => toolNode.nodeId);
  const parentContext = getWorkflowContext();
  const parentVariableContext = parentContext.variableContext;
  // 只统计子流程实际返回的次数；队列用它扣减本层预算，抛错的子流程没有可计数结果。
  let toolRunTimes = 0;

  /**
   * 每次工具调用使用独立变量快照；正常完成或交互暂停时提交已完成节点的变量增量。
   * 暂停快照不包含变量副本，提交后下一轮才能从父级恢复且无需重跑暂停前节点。
   * 完成后立即提交，不等待更早发起的调用；同名变量按实际写回顺序覆盖。
   */
  const runWorkflowTool: CreateAgentLoopCoreWorkflowToolRunnerParams<WorkflowInteractiveResponseType>['runWorkflowTool'] =
    async ({ runtimeNodes, runtimeEdges, lastInteractive }) => {
      const stateSnapshot = new WorkflowRunStateSnapshot({
        workflowStreamResponse: parentContext.workflowStreamResponse,
        variableContext: parentVariableContext
      });
      const childContext = parentContext.getChildContext({
        workflowStreamResponse: stateSnapshot.workflowStreamResponse,
        memoryContext: memoryContext.fork(),
        runtimeControl: { isToolCall: true },
        variableContext: stateSnapshot.variableContext,
        nodeResponseSink: parentContext.nodeResponseSink.getChildContext({
          workflowRuntimeSummary: createWorkflowRuntimeSummary(),
          ...(workflowProps.nodeResponseParentId !== undefined
            ? { defaultParentId: workflowProps.nodeResponseParentId }
            : {})
        })
      });
      const result = await runWithContext(childContext, () =>
        runWorkflow({
          ...workflowProps,
          // 继承父流程的流式能力；是否禁流由子节点的 forbidStream 控制。
          // 简易应用在表单转换时强制禁流，不能在共用 ToolCall 层关闭所有工作流的输出。
          ...(lastInteractive ? { lastInteractive } : {}),
          runtimeNodes,
          runtimeEdges,
          // 工具调用自身不再生成 wrapper，子工作流节点直接挂到外层 ToolCall 节点。
          nodeResponseParentId: workflowProps.nodeResponseParentId
        })
      );
      memoryContext.merge(result[DispatchNodeResponseKeyEnum.memories]);
      toolRunTimes += result[DispatchNodeResponseKeyEnum.runTimes] ?? 0;
      onWorkflowRuntimeSummary?.(result.workflowRuntimeSummary);

      if (!result.workflowRuntimeSummary.errorCount && !parentContext.checkIsStopping()) {
        // 在父 Context 中提交变量差量；节点输出仍由 tool runner 独立提交。
        await runWithContext(parentContext, () => stateSnapshot.commit());
      } else {
        stateSnapshot.discard();
      }

      return {
        flowResponses: result.flatNodeResponses ?? [],
        workflowRuntimeSummary: result.workflowRuntimeSummary,
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
    runWorkflowTool
  });
  const { fileContext } = getWorkflowContext();
  const readFileMaxFileAmount = fileContext.limits.maxFileAmount;
  const readFileExecutor = createAgentLoopCoreReadFileExecutor({
    enabled: true,
    execute: async ({ files }) =>
      dispatchWorkflowReadFiles({
        files,
        teamId: workflowProps.runningUserInfo.teamId,
        tmbId: workflowProps.runningUserInfo.tmbId,
        customPdfParse: workflowProps.chatConfig?.fileSelectConfig?.customPdfParse,
        usageId: workflowProps.usageId,
        maxFileAmount: readFileMaxFileAmount
      })
  });

  return {
    finalMessages,
    buildRuntimeTools: () => tools,
    getToolInfo,
    executeTool: async (params) => {
      const result = await runTool(params);
      return {
        ...result,
        interactive: createWorkflowToolInteractive({
          interactive: result.interactive,
          toolCallId: params.call.id
        })
      };
    },
    executeInteractiveTool: async (
      params: AgentLoopInteractiveToolExecuteParams<WorkflowInteractiveResponseType>
    ) => {
      const result = await runInteractiveTool(params);
      return {
        ...result,
        interactive: createWorkflowToolInteractive({
          interactive: result.interactive,
          toolCallId: params.toolCallId
        })
      };
    },
    readFileExecutor,
    readFileMaxFileAmount,
    getToolRunTimes: () => toolRunTimes,
    datasetSearchExecutor:
      datasetSearchNodeIds.length > 0
        ? createAgentLoopCoreWorkflowSystemToolExecutor({
            runtimeNodes,
            runtimeEdges,
            entryNodeIds: datasetSearchNodeIds,
            runWorkflowTool
          })
        : undefined
  };
};
