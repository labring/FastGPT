export {
  CanonicalWorkflowDataSchema,
  CanonicalAgentToolInputConfigSchema,
  CanonicalFlowNodeInputItemSchema as CanonicalFlowNodeInputItemTypeSchema,
  LegacyStoreNodeItemSchema as LegacyStoreNodeItemTypeSchema,
  LegacyWorkflowDataSchema,
  LegacyFlowNodeInputItemSchema as LegacyFlowNodeInputItemTypeSchema,
  LegacyAgentToolInputConfigSchema,
  type CanonicalWorkflowData,
  type CanonicalAgentToolInputConfig,
  type CanonicalFlowNodeInputItem as CanonicalFlowNodeInputItemType,
  type LegacyStoreNodeItem as LegacyStoreNodeItemType,
  type LegacyFlowNodeInputItem as LegacyFlowNodeInputItemType,
  type LegacyWorkflowData,
  type LegacyAgentToolInputConfig as LegacyAgentToolInputConfigType
} from './schema';

export {
  migrateAgentToolInputConfigToCurrent as migrateAgentToolInputConfigToV1,
  migrateFlowNodeInputToCurrent as migrateFlowNodeInputToV1,
  migrateWorkflowToCurrent as migrateWorkflowToV1
} from './migrate';

// [TODO] add an explicit version field and dispatch migrations by version.
