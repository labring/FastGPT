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

export { migrateWorkflowToCurrent } from './migrate';

// [TODO] add an explicit version field and dispatch migrations by version.
