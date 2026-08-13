import z from 'zod';
import { IntSchema } from '../../../common/zod';
import { FlowNodeInputItemTypeSchema } from '../type/io';
import { FlowNodeInputTypeEnum } from '../node/constant';
import { AgentToolInputModeEnum } from '../../app/tool/constants';

/**
 * 历史工作流输入。旧索引只允许在外部数据迁移阶段出现。
 */
export const LegacyFlowNodeInputItemTypeSchema = FlowNodeInputItemTypeSchema.extend({
  selectedTypeIndex: IntSchema.optional().meta({
    description: '历史工作流输入类型索引',
    deprecated: true
  })
});
export type LegacyFlowNodeInputItem = z.infer<typeof LegacyFlowNodeInputItemTypeSchema>;

/**
 * 当前工作流输入。该类型不包含任何历史字段。
 */
export const CanonicalFlowNodeInputItemTypeSchema = FlowNodeInputItemTypeSchema;
export type CanonicalFlowNodeInputItem = z.infer<typeof CanonicalFlowNodeInputItemTypeSchema>;

/**
 * Agent 工具输入配置在应用内部使用的当前形态。
 */
const CanonicalAgentToolInputConfigValueSchema = z.object({
  key: z.string().meta({
    description: '工具输入字段的稳定 key，对应当前工具定义中的 NodeIO key'
  }),
  mode: z.enum(AgentToolInputModeEnum).meta({
    description: '该输入的值来源：agentGenerated 由模型生成，manual 使用 Agent 配置中的固定值'
  })
});

/**
 * Agent 工具输入配置的 Legacy schema。
 *
 * 持久化位置：Agent 节点 `inputs[selectedTools].value[*].inputs[*]`。
 *
 * 当前写入格式只包含 `{ key, mode }`；
 * 历史数据可能把完整 NodeIO 快照直接放在这里，例如同时包含 `renderTypeList`、`selectedType` 或 `selectedTypeIndex`。
 *
 * 预处理规则：
 * - 优先使用历史 `selectedType`
 * - 否则使用 `renderTypeList[selectedTypeIndex]` 推导 mode。
 * - 无法推导为 `agentGenerated` 时归为 `manual`。
 * - 工具的最新 label、valueType、renderTypeList 和 JSON Schema 不从该快照恢复，而是在服务端详情读取或运行时从当前工具定义重新加载。
 */
export const LegacyAgentToolInputConfigSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  if (input.mode !== undefined) return value;
  if (typeof input.key !== 'string') return value;

  const renderTypeList = Array.isArray(input.renderTypeList) ? input.renderTypeList : [];
  const selectedType =
    input.selectedType ??
    (typeof input.selectedTypeIndex === 'number'
      ? renderTypeList[input.selectedTypeIndex]
      : undefined);

  return {
    key: input.key,
    mode:
      selectedType === FlowNodeInputTypeEnum.agentGenerated
        ? AgentToolInputModeEnum.agentGenerated
        : AgentToolInputModeEnum.manual
  };
}, CanonicalAgentToolInputConfigValueSchema);
export type LegacyAgentToolInputConfig = z.infer<typeof LegacyAgentToolInputConfigSchema>;
