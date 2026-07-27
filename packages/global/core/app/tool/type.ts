import z from 'zod';
import type { StoreEdgeItemType } from '../../workflow/type/edge';
import type { StoreNodeItemType } from '../../workflow/type/node';
import { NodeToolConfigTypeSchema } from '../../workflow/type/node';
import { FlowNodeInputTypeEnum } from '../../workflow/node/constant';
import type { AppChatConfigType } from '../type';
import { AgentToolInputModeEnum } from './constants';

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

const AgentToolInputConfigValueSchema = z.object({
  key: z.string(),
  mode: z.enum(AgentToolInputModeEnum)
});

/**
 * Agent 工具只持久化参数输入来源。预处理兼容 selectedType 上线期间产生的临时快照，
 * 解析结果始终收敛为 key + mode，避免 runtime 继续依赖工作流渲染协议。
 */
export const AgentToolInputConfigSchema = z.preprocess((value) => {
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
}, AgentToolInputConfigValueSchema);
export type AgentToolInputConfigType = z.infer<typeof AgentToolInputConfigSchema>;

export const AgentToolSchema = z.object({
  id: z.string(),
  source: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  inputs: z.array(AgentToolInputConfigSchema).optional(),
  config: z.record(z.string(), z.any())
});
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
