import z from 'zod';
import type { StoreEdgeItemType } from '../../workflow/type/edge';
import type { StoreNodeItemType } from '../../workflow/type/node';
import { NodeToolConfigTypeSchema } from '../../workflow/type/node';
import type { AppChatConfigType } from '../type';
import {
  CanonicalAgentToolInputConfigSchema,
  CanonicalUnavailableAgentToolSchema
} from '../../workflow/migration';

export type AppToolRuntimeType = {
  id: string;
  teamId?: string;
  tmbId?: string;

  name: string;
  avatar: string;
  showStatus?: boolean;
  isTool?: boolean;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
  currentCost?: number;
  systemKeyCost?: number;
  hasTokenFee?: boolean;
  /** 系统工具关联的真实 workflow app。存在时按系统级 workflow tool 处理。 */
  associatedPluginId?: string;
};

/**
 * Agent 工具中单个输入的持久化配置。
 *
 * 数据位于 Agent 节点 `inputs[selectedTools].value[*].inputs`，随工作流草稿或版本快照保存。
 * 当前格式只保存字段关联和输入来源：`key` 标识工具输入，`mode` 决定由模型生成还是使用
 * `AgentTool.config[key]` 中的固定值。历史完整 NodeIO 快照只在 workflow migration 边界预处理。
 */
export const AgentToolInputConfigSchema = CanonicalAgentToolInputConfigSchema;
export type AgentToolInputConfigType = z.infer<typeof AgentToolInputConfigSchema>;

const AgentToolBaseSchema = z.object({
  id: z.string(),
  // 空字符串表示保持最新版本，不能在序列化时被 truthy 判断过滤。
  version: z.string().optional(),
  source: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  inputs: z.array(AgentToolInputConfigSchema).optional(),
  config: z.record(z.string(), z.any())
});

const AvailableAgentToolSchema = AgentToolBaseSchema.extend({
  isUnavailable: z.undefined().optional(),
  unresolvedInputs: z.never().optional()
});

export const AgentToolSchema = z.union([
  AvailableAgentToolSchema,
  CanonicalUnavailableAgentToolSchema
]);
export type AgentToolType = z.infer<typeof AgentToolSchema>;

// // System tool

// export type AppToolTemplateListItemType = Omit<
//   AppToolTemplateItemType,
//   'name' | 'intro' | 'workflow'
// > & {
//   name: string;
//   intro: string;
//   tags?: SystemPluginToolTagType[];
// };
