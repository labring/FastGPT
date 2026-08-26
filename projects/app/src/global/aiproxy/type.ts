import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import type {
  ChannelDashboardSummary,
  ChannelLogListItem
} from '@fastgpt/global/openapi/core/ai/channel/api';

/**
 * 渠道信息 — 对齐 GET /api/core/ai/channel/list 的 ChannelListItem（模型管理重构 §2.9.4）。
 * 旧 aiproxy 直通渠道接口（/api/aiproxy/api/channels/*）已迁移到 /api/core/ai/channel/*，
 * 见 projects/app/src/web/core/ai/channel.ts。
 * key 为创建/编辑表单私有字段：列表接口不回传密钥，仅表单使用。
 */
export type ChannelInfoType = {
  id: number;
  name: string;
  type: number;
  status: number; // 1=启用 / 2=禁用（ChannelStautsMap 兼容 0/3）
  models: string[];
  model_mapping?: Record<string, any>;
  base_url?: string;
  priority?: number;
  sets?: string[];
  used_amount?: number;
  request_count?: number;
  created_at?: number;
  group_id?: string;
  relatedModelCount?: number;
  sourceMember?: SourceMemberType; // 创建人信息 — 仅 root 团队渠道视图（groupType=team）返回
  key?: string;
};

/**
 * 渠道关联模型 — GET /core/ai/channel/models 返回项。
 * 与 affectedModels 语义不同：为渠道桶内全部关联模型（模型名匹配），
 * 用于列表悬浮查看关联模型明细。
 */
export type ChannelRelatedModelItem = {
  modelId: string;
  name: string;
  model: string;
};

// Log
export type ChannelLogListItemType = ChannelLogListItem;
export type DashboardDataItemType = ChannelDashboardSummary;
