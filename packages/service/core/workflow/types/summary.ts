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
  /** 当前 workflow 是否出现节点错误。 */
  hasError: boolean;
  /** 最近一次错误文本。 */
  errorText?: string;
  /** 当前 workflow 的错误响应数量。 */
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
  /** 当前 workflow 已归属到本统计链路的 LLM 输入 token。 */
  llmInputTokens: number;
  /** 当前 workflow 已归属到本统计链路的 LLM 输出 token。 */
  llmOutputTokens: number;
};
