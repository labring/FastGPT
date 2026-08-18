export {
  CanonicalWorkflowDataSchema,
  CanonicalAgentToolInputConfigSchema,
  CanonicalFlowNodeInputItemSchema,
  type CanonicalWorkflowData,
  type CanonicalAgentToolInputConfig,
  type CanonicalFlowNodeInputItem
} from './schema';

export {
  LegacyStoreNodeItemSchema,
  LegacyWorkflowDataSchema,
  LegacyFlowNodeInputItemSchema,
  LegacyAgentToolInputConfigSchema,
  type LegacyStoreNodeItem,
  type LegacyFlowNodeInputItem,
  type LegacyWorkflowData,
  type LegacyWorkflowDataInput,
  type LegacyAgentToolInputConfig
} from './legacy/schema';

export type {
  LegacyWorkflowToolRef,
  WorkflowMigrationOptions,
  WorkflowMigrationToolDefinition
} from './type';

export { migrateWorkflowToCurrent } from './migrate';

// [TODO] add an explicit version field and dispatch migrations by version.
