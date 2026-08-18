import z from 'zod';
import { AppChatConfigTypeSchema } from '../../app/type';
import { FlowNodeInputItemTypeSchema } from '../type/io';
import { AgentToolInputModeEnum } from '../../app/tool/constants';
import { NodeToolConfigTypeSchema, StoreNodeItemTypeSchema } from '../type/node';
import { StoreEdgeItemTypeSchema } from '../type/edge';

/**
 * 当前工作流输入。该类型不包含任何历史字段。
 */
export const CanonicalFlowNodeInputItemSchema = FlowNodeInputItemTypeSchema;
export type CanonicalFlowNodeInputItem = z.infer<typeof CanonicalFlowNodeInputItemSchema>;

/**
 * 当前版本的 Agent 工具输入配置。
 */
export const CanonicalAgentToolInputConfigSchema = z.object({
  key: z.string().meta({
    description: '工具输入字段的稳定 key，对应当前工具定义中的 NodeIO key'
  }),
  mode: z.enum(AgentToolInputModeEnum).meta({
    description: '该输入的值来源：agentGenerated 由模型生成，manual 使用 Agent 配置中的固定值'
  })
});
export type CanonicalAgentToolInputConfig = z.infer<typeof CanonicalAgentToolInputConfigSchema>;

/**
 * 不可用工具保留的历史输入快照。该载荷用于后续 resolver 恢复，不参与 runtime schema。
 */
export const LegacyAgentToolInputSnapshotSchema = z.record(z.string(), z.unknown());
export type LegacyAgentToolInputSnapshot = z.infer<typeof LegacyAgentToolInputSnapshotSchema>;

/** 缺失工具定义时的可持久化占位分支。 */
export const CanonicalUnavailableAgentToolSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
  source: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  config: z.record(z.string(), z.unknown()),
  isUnavailable: z.literal(true),
  inputs: z.never().optional(),
  unresolvedInputs: z.array(LegacyAgentToolInputSnapshotSchema).optional()
});
export type CanonicalUnavailableAgentTool = z.infer<typeof CanonicalUnavailableAgentToolSchema>;

/**
 * 当前版本的工作流数据。
 */
export const CanonicalWorkflowDataSchema = z.object({
  nodes: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  chatConfig: AppChatConfigTypeSchema.default({})
});
export type CanonicalWorkflowData = z.infer<typeof CanonicalWorkflowDataSchema>;
