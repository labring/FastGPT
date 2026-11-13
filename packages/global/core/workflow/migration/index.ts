export {
  CanonicalWorkflowDataSchema,
  CanonicalAgentToolInputConfigSchema,
  CanonicalSelectedToolsValueSchema,
  CanonicalFlowNodeInputItemSchema,
  type CanonicalWorkflowData,
  type CanonicalAgentToolInputConfig,
  type CanonicalFlowNodeInputItem
} from './schema';

export {
  LegacyStoreNodeItemSchema,
  LegacyWorkflowDataSchema,
  LegacyFlowNodeInputItemSchema,
  type LegacyStoreNodeItem,
  type LegacyFlowNodeInputItem,
  type LegacyWorkflowData,
  type LegacyWorkflowDataInput
} from './legacy/schema';

export { migrateWorkflowToCurrent, isLegacyV1Workflow } from './migrate';

// ? Not so related to data migration. It's more about normalizing editor value to storage value.
export { normalizeAgentToolInputs } from './agentToolInput';

// [TODO] add an explicit version field and dispatch migrations by version.
