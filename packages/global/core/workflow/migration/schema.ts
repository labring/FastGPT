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
 * 不可用工具在迁移边界允许保留 sparse 配置或历史 NodeIO 快照。
 * 该类型只用于 unresolved 分支，正常可用工具仍必须使用 canonical 配置。
 */
export const AgentToolInputBoundarySchema = z.looseObject({
  key: z.string().optional(),
  mode: z.string().optional(),
  selectedType: z.string().optional(),
  selectedTypeIndex: z.number().optional(),
  renderTypeList: z.array(z.string()).optional(),
  value: z.any().optional(),
  defaultValue: z.any().optional()
});
export type AgentToolInputBoundary = {
  key?: string;
  mode?: string;
  selectedType?: string;
  selectedTypeIndex?: number;
  renderTypeList?: string[];
  value?: any;
  defaultValue?: any;
  [key: string]: any;
};

/** 缺失工具定义时的可持久化占位分支。 */
export const CanonicalUnavailableAgentToolSchema = z.looseObject({
  id: z.string(),
  version: z.string().optional(),
  source: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  config: z.record(z.string(), z.unknown()),
  isUnavailable: z.literal(true),
  inputs: z.array(AgentToolInputBoundarySchema).optional()
});
export type CanonicalUnavailableAgentTool = z.infer<typeof CanonicalUnavailableAgentToolSchema>;

/** 当前版本的可用 Agent 工具；只约束工具身份和输入配置，保留展示元数据。 */
export const CanonicalAvailableAgentToolSchema = z.looseObject({
  id: z.string(),
  inputs: z.array(CanonicalAgentToolInputConfigSchema).optional(),
  config: z.record(z.string(), z.unknown()),
  isUnavailable: z.literal(false).optional()
});

/** Agent 工具选择的 canonical 联合结构。 */
export const CanonicalSelectedAgentToolSchema = z.union([
  CanonicalUnavailableAgentToolSchema,
  CanonicalAvailableAgentToolSchema
]);

/** Agent 工具选择可为工具列表或工作流变量引用。 */
export const CanonicalSelectedToolsValueSchema = z.union([
  z.array(CanonicalSelectedAgentToolSchema),
  z.tuple([z.string(), z.string()])
]);

/**
 * 当前版本的工作流数据。
 */
export const CanonicalWorkflowDataSchema = z.object({
  nodes: z.array(StoreNodeItemTypeSchema),
  edges: z.array(StoreEdgeItemTypeSchema),
  chatConfig: AppChatConfigTypeSchema.default({})
});
export type CanonicalWorkflowData = z.infer<typeof CanonicalWorkflowDataSchema>;
