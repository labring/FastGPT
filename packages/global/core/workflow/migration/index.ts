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
  type LegacyWorkflowDataInput,
  type LegacyAgentToolInputConfig
} from './schema';

export {
  migrateAgentToolInputConfigToCurrent,
  migrateFlowNodeInputToCurrent,
  getLegacySavedToolInputSelectedType,
  migrateLegacyFlowNodeInputToCurrent,
  migrateLegacyWorkflowHttpToolInputsDefaultMode,
  migrateLegacyWorkflowToolInputsDefaultMode
} from './legacy/input';

export { migrateSystemConfigToChatConfig } from './legacy/systemConfig';

export { migrateWorkflowToCurrent } from './migrate';

// [TODO] add an explicit version field and dispatch migrations by version.
