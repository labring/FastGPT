import { trace } from '@opentelemetry/api';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { isUserConfigError } from '@fastgpt/global/common/error/utils';

export type WorkflowObservedStepResult = {
  node: RuntimeNodeItemType;
  runStatus: 'run';
  nodeResponseId: string;
  result: {
    [DispatchNodeResponseKeyEnum.nodeResponse]?: ChatHistoryItemResType;
    rawError?: unknown;
    [key: string]: unknown;
  };
};

const tracedWorkflowStepTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.appModule,
  FlowNodeTypeEnum.pluginModule,
  FlowNodeTypeEnum.agent,
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.datasetSearchNode,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.queryExtension,
  FlowNodeTypeEnum.toolCall,
  FlowNodeTypeEnum.httpRequest468,
  FlowNodeTypeEnum.code,
  FlowNodeTypeEnum.readFiles,
  FlowNodeTypeEnum.tool
]);

/**
 * 判断当前节点是否需要创建独立 OTel span。
 *
 * 高频或轻量工具节点只追加 step event，避免 trace 里出现大量低价值 span；核心模型、
 * 工具、知识库等节点才提升为独立 span。
 */
export const shouldTraceWorkflowStep = (nodeType: FlowNodeTypeEnum) =>
  tracedWorkflowStepTypes.has(nodeType);

/**
 * 从节点执行结果提取指标/trace 状态。
 *
 * `nodeResponse.error` 和 dispatcher 的 `rawError` 表示节点故障，分支输出 `error` 本身不表示故障，
 * 否则 metrics 和 OTel span 会出现一个成功一个失败的分裂状态。用户配置错误使用独立状态，
 * 避免进入 error 指标，同时保留其发生次数。
 * Queue 在移除已持久化的 responseData 前提取状态，避免观测结果依赖详情保存策略。
 */
export const getWorkflowStepStatus = (
  result: WorkflowObservedStepResult
): 'ok' | 'error' | 'user_error' => {
  const nodeResponse = result.result[DispatchNodeResponseKeyEnum.nodeResponse];
  const topLevelError = result.result.rawError;

  // 分类仅读取本轮原始异常，历史详情不参与本轮日志或指标的降噪判断。
  if (Object.hasOwn(result.result, 'rawError')) {
    return isUserConfigError(topLevelError) ? 'user_error' : 'error';
  }

  return nodeResponse?.error !== undefined || nodeResponse?.errorText !== undefined
    ? 'error'
    : 'ok';
};

/**
 * 在当前 active span 上追加轻量 step event。
 *
 * 未创建独立 span 的节点仍需要在父 workflow span 里留下开始/结束事件，便于串联查看
 * 节点耗时和失败位置；没有 active span 时静默跳过。
 */
export const addWorkflowStepEvent = ({
  eventName,
  nodeType,
  mode,
  status,
  durationMs
}: {
  eventName: 'workflow.step.start' | 'workflow.step.end';
  nodeType: FlowNodeTypeEnum;
  mode: string;
  status?: 'ok' | 'error' | 'user_error';
  durationMs?: number;
}) => {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  const attributes: Record<string, string | number> = {
    'fastgpt.workflow.node.type': nodeType,
    'fastgpt.workflow.mode': mode
  };

  if (status) {
    attributes['fastgpt.workflow.step.status'] = status;
  }
  if (typeof durationMs === 'number') {
    attributes['fastgpt.workflow.step.duration_ms'] = durationMs;
  }

  activeSpan.addEvent(eventName, attributes);
};
