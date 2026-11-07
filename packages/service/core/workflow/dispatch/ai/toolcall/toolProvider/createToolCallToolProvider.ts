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
  type CreateAgentLoopCoreWorkflowToolRunnerParams,
  type AgentLoopCoreToolRunFlowResponse
} from '../../agentLoopCore/interface';
import { runWorkflow } from '../../../index';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { dispatchWorkflowReadFiles } from '../../readFiles';
import { getWorkflowContext, runWithContext } from '../../../context';
import type { DispatchFlowResponse } from '../../../type';
import { WorkflowMemoryState } from '../../../../memory/state';
import { WorkflowRunStateSnapshot } from '../../../utils/containerRunState';

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
  cacheToolFlowResponse,
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
  cacheToolFlowResponse: CacheToolFlowResponse;
  onWorkflowRuntimeSummary?: (summary?: DispatchFlowResponse['workflowRuntimeSummary']) => void;
}): Promise<ToolCallToolProvider> => {
  const memoryState = WorkflowMemoryState.fromWorkflow(workflowProps);
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

  /**
   * 每次工具调用使用独立变量快照；正常完成或交互暂停时提交已完成节点的变量增量。
   * 暂停快照不包含变量副本，提交后下一轮才能从父级恢复且无需重跑暂停前节点。
   * 完成后立即提交，不等待更早发起的调用；同名变量按实际写回顺序覆盖。
   */
  const runWorkflowTool: CreateAgentLoopCoreWorkflowToolRunnerParams<WorkflowInteractiveResponseType>['runWorkflowTool'] =
    async ({ runtimeNodes, runtimeEdges, lastInteractive }) => {
      let hasVariableUpdate = false;
      const stateSnapshot = new WorkflowRunStateSnapshot({
        variableContext: parentVariableContext
      });
      const childContext = parentContext.getChildContext({
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
          // 副本的全量变量不能直接覆盖客户端；其他流事件仍按原顺序透传。
          workflowStreamResponse: workflowProps.workflowStreamResponse
            ? (event) => {
                if (event.event === SseResponseEventEnum.updateVariables) {
                  hasVariableUpdate = true;
                } else {
                  workflowProps.workflowStreamResponse?.(event);
                }
              }
            : undefined,
          memoryState: memoryState.fork(),
          // 继承父流程的流式能力；是否禁流由子节点的 forbidStream 控制。
          // 简易应用在表单转换时强制禁流，不能在共用 ToolCall 层关闭所有工作流的输出。
          ...(lastInteractive ? { lastInteractive } : {}),
          runtimeNodes,
          runtimeEdges,
          // 工具调用自身不再生成 wrapper，子工作流节点直接挂到外层 ToolCall 节点。
          nodeResponseParentId: workflowProps.nodeResponseParentId
        })
      );
      memoryState.merge(result[DispatchNodeResponseKeyEnum.memories]);
      onWorkflowRuntimeSummary?.(result.workflowRuntimeSummary);

      if (!result.workflowRuntimeSummary.errorCount && !parentContext.checkIsStopping()) {
        // 在父 Context 中提交变量差量；节点输出仍由 tool runner 独立提交。
        await runWithContext(parentContext, async () => {
          await stateSnapshot.commit();
          // 每个调用按完成顺序发布合并后的父级记录，包含先完成兄弟已提交的无关变量。
          if (hasVariableUpdate) {
            workflowProps.workflowStreamResponse?.(
              workflowSseEvent.updateVariables(parentVariableContext.toStoreRecord())
            );
          }
        });
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
    runWorkflowTool,
    cacheToolFlowResponse
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
