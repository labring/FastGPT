export {
  CanonicalWorkflowDataSchema,
  CanonicalAgentToolInputConfigSchema,
  CanonicalFlowNodeInputItemSchema,
  LegacyStoreNodeItemSchema,
  LegacyWorkflowDataSchema,
  LegacyFlowNodeInputItemSchema,
  LegacyAgentToolInputConfigSchema,
  type CanonicalWorkflowData,
  type CanonicalAgentToolInputConfig,
  type CanonicalFlowNodeInputItem,
  type LegacyStoreNodeItem,
  type LegacyFlowNodeInputItem,
  type LegacyWorkflowData,
  type LegacyAgentToolInputConfig
} from './schema';

export {
  migrateAgentToolInputConfigToCurrent,
  migrateFlowNodeInputToCurrent,
  migrateWorkflowToCurrent
} from './migrate';

// [TODO] add an explicit version field and dispatch migrations by version.
