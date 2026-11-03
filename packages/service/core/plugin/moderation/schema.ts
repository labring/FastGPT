import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo/index';
import type { ModerationPluginConfigType } from '@fastgpt/global/core/plugin/moderation/type';

const { Schema } = connectionMongo;

export const collectionName = 'system_moderation_plugins';

/**
 * 内容审查插件配置表。
 *
 * 与 `system_plugin_tools` 分开：审查插件不是工具，没有计费/推荐标签/工具体积字段，
 * 也不作为工作流节点或 Agent 工具被引用。两者只共用「插件标识 + 加密配置」这一概念。
 *
 * 允许多条记录同时存在（多个 provider 各自保留配置），但全局只允许一条 `enabled: true`，
 * 由 service 层在启用时同步停用其他记录。
 */
const SystemModerationPluginSchema = new Schema({
  /** plugin service 中的插件 ID，不带前缀 */
  pluginId: {
    type: String,
    required: true
  },
  /** 插件来源，如 system / teamId:<teamId>。为空时按 system 处理 */
  source: String,
  /** 用户选择的版本；为空表示跟随最新版本 */
  version: String,
  /**
   * 是否启用。数据层不限制唯一性（允许历史记录残留），全部写入路径都经 service 层，
   * 由其在启用时先停用其他记录。
   */
  enabled: {
    type: Boolean,
    default: false
  },
  /**
   * 加密后的插件配置（厂商凭据、策略 ID）。
   * 密钥字段以 `{ secret }` 结构存储，非密钥字段保持原值。
   */
  secretsVal: Object,
  /** 软删除标记。与系统工具一致，删除只标记不物理删除 */
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedByTmbId: String,
  createTime: {
    type: Date,
    default: Date.now
  },
  updateTime: {
    type: Date,
    default: Date.now
  }
});

// 同一插件只保留一条记录（软删除后重新安装时复用该条）
defineIndex(SystemModerationPluginSchema, {
  key: { pluginId: 1, source: 1 },
  options: { unique: true }
});
// 列表按启用状态与更新时间排序
defineIndex(SystemModerationPluginSchema, { key: { enabled: 1, updateTime: -1 } });

export const MongoSystemModerationPlugin = getMongoModel<ModerationPluginConfigType>(
  collectionName,
  SystemModerationPluginSchema
);