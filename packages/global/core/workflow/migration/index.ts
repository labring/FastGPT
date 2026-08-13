export {
  CanonicalFlowNodeInputItemTypeSchema,
  LegacyFlowNodeInputItemTypeSchema,
  LegacyAgentToolInputConfigSchema,
  type CanonicalFlowNodeInputItem as CanonicalFlowNodeInputItemType,
  type LegacyFlowNodeInputItem as LegacyFlowNodeInputItemType,
  type LegacyAgentToolInputConfig as LegacyAgentToolInputConfigType
} from './schema';

// [TODO] add an explicit version field and dispatch migrations by version.
