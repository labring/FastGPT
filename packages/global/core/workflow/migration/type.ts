import type { CanonicalFlowNodeInputItem } from './schema';

/** 迁移 Agent 历史工具输入时所需的最小当前工具定义。 */
export type WorkflowMigrationToolDefinition = {
  inputs: CanonicalFlowNodeInputItem[];
};

/** 历史 Agent 工具引用；migration 不拥有权限或资源加载实现。 */
export type LegacyWorkflowToolRef = {
  id: string;
  version?: string;
  source?: string;
};

export type WorkflowMigrationOptions = {
  resolveToolDefinition?: (
    ref: LegacyWorkflowToolRef
  ) => Promise<WorkflowMigrationToolDefinition | undefined>;
};
