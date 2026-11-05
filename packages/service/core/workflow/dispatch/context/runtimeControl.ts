/**
 * 当前 workflow 层的运行控制状态，不属于节点业务入参。
 * 队列统一扣减本层预算；节点执行时捕获快照，子流程从该快照派生，避免并发串状态。
 */
export type WorkflowRuntimeControl = {
  mode: 'test' | 'chat' | 'debug';
  maxRunTimes: number;
  /** runWorkflow 进入时递增，完成、失败或深度拒绝后恢复。 */
  workflowDispatchDeep: number;
  isToolCall: boolean;
};
