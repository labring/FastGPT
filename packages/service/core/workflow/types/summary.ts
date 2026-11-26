/**
 * Workflow 运行摘要的数据字段。
 *
 * 完整的 workflow summary 和节点 callback 的增量 summary 共用这组字段；
 * 两者的区别由使用方的完整性和生命周期约束表达，而不是重复声明字段。
 */
export type WorkflowRuntimeSummaryFields = {
  /** 本次 workflow 已写入/产生的 response id。 */
  responseIds: string[];
  /** 已完成的 nodeId。 */
  finishedNodeIds: string[];
  /** 最近一次错误文本。 */
  errorText?: string;
  /** 本轮未捕获的错误响应数量；大于 0 表示流程失败，不承担日志上报控制。 */
  errorCount: number;
  /** loopRunBreak 节点是否命中。 */
  hasLoopRunBreak: boolean;
  /** stopTool 是否命中。 */
  hasToolStop: boolean;
  /** nestedEnd 节点是否到达。 */
  hasNestedEnd: boolean;
  /** nestedEnd 输出值。 */
  nestedEndOutput?: any;
  /** pluginOutput 输出值。 */
  pluginOutput?: Record<string, any>;
  /** 当前 workflow response 中去重后的引用集合。 */
  citeCollectionIds: string[];
  /** 当前 workflow 归属的积分总和；父 nodeResponse 不缓存 child points。 */
  totalPoints?: number;
  /** 当前 workflow 响应数量，包含嵌套 childResponseCount。 */
  childResponseCount?: number;
  /** 当前 workflow 或子应用/子工具是否启用了 Agent Sandbox。 */
  hasAgentSandbox?: boolean;
  /** 工具调用子流程内是否命中了未捕获的内容审核拦截（由上层工具适配层转换为统一脱敏工具返回结果，不作为节点失败上报）。 */
  hasModerationBlock?: boolean;
  /** 工具调用子流程内的输出是否已完成工具结果内容审核（用于避免外层重复触发审核插件调用）。 */
  hasToolResultModerated?: boolean;
  /** 当前 workflow 已归属到本统计链路的 LLM 输入 token。 */
  llmInputTokens: number;
  /** 当前 workflow 已归属到本统计链路的 LLM 输出 token。 */
  llmOutputTokens: number;
};
