import type {
  CanonicalAgentToolInputConfig,
  CanonicalFlowNodeInputItem,
  CanonicalWorkflowData,
  LegacyAgentToolInputConfig,
  LegacyFlowNodeInputItem,
  LegacyWorkflowData
} from './schema';
import {
  CanonicalAgentToolInputConfigSchema,
  CanonicalWorkflowDataSchema,
  LegacyAgentToolInputConfigSchema,
  LegacyWorkflowDataSchema
} from './schema';

// [TODO] add an explicit version field and dispatch migrations by version.

/**
 * 将单个历史输入收敛为当前 selectedType 协议，并移除旧索引。
 */
export const migrateFlowNodeInputToCurrent = (
  input: LegacyFlowNodeInputItem
): CanonicalFlowNodeInputItem => {
  const { selectedTypeIndex: _selectedTypeIndex, ...canonicalInput } = input;
  const selectedType =
    input.selectedType ??
    (input.selectedTypeIndex === undefined
      ? undefined
      : input.renderTypeList?.[input.selectedTypeIndex]);

  return {
    ...canonicalInput,
    renderTypeList: input.renderTypeList ?? [],
    ...(selectedType === undefined ? {} : { selectedType })
  } as CanonicalFlowNodeInputItem;
};

/**
 * 将 Agent 工具的完整历史 NodeIO 或当前配置统一为 `{ key, mode }`。
 */
export const migrateAgentToolInputConfigToCurrent = (
  input: LegacyAgentToolInputConfig
): CanonicalAgentToolInputConfig =>
  CanonicalAgentToolInputConfigSchema.parse(LegacyAgentToolInputConfigSchema.parse(input));

/**
 * 将工作流迁移为当前版本。
 * 迁移只处理可由结构稳定推导的字段；工具定义、权限和 Schema 水合留给边界层。
 */
export const migrateWorkflowToCurrent = (input: LegacyWorkflowData): CanonicalWorkflowData => {
  const legacy = LegacyWorkflowDataSchema.parse(input);
  const migrated = {
    ...legacy,
    nodes: legacy.nodes.map((node) => ({
      ...node,
      inputs: node.inputs.map(migrateFlowNodeInputToCurrent)
    }))
  };

  return CanonicalWorkflowDataSchema.parse(migrated);
};
