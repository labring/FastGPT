import { MongoSystemModerationPlugin } from './schema';
import type { ModerationPluginConfigType } from '@fastgpt/global/core/plugin/moderation/type';
import type { ClientSession } from '../../../common/mongo';

export type ModerationConfigQuery = {
  pluginId: string;
  source?: string;
};

/**
 * 从数据库读出的扁平配置记录。
 *
 * 不用 mongoose 的 `lean()` 推导类型：它会把 `secretsVal` 推到 `FlattenMaps` 包装层，
 * 与业务层使用的纯对象结构不一致，导致每次传入都要断言。
 */
export type ModerationConfigRecord = {
  pluginId: string;
  source?: string;
  version?: string;
  enabled?: boolean;
  secretsVal?: Record<string, unknown> | null;
  deleted?: boolean;
};

/** 按插件标识读取本地配置记录。source 为空时按 system 处理（与安装时的默认来源一致） */
export const findModerationConfig = (
  query: ModerationConfigQuery
): Promise<ModerationConfigRecord | null> =>
  MongoSystemModerationPlugin.findOne({
    pluginId: query.pluginId,
    ...(query.source && query.source !== 'system'
      ? { source: query.source }
      : { $or: [{ source: 'system' }, { source: null }] })
  })
    .sort({ updateTime: -1, _id: -1 })
    .lean<ModerationConfigRecord>();

/** 读取所有插件配置记录 */
export const findActiveModerationConfigs = (): Promise<ModerationConfigRecord[]> =>
  MongoSystemModerationPlugin.find({
    deleted: { $ne: true }
  }).lean<ModerationConfigRecord[]>();

/** 读取所有插件配置记录 */
export const findAllModerationConfigs = (): Promise<ModerationConfigRecord[]> =>
  MongoSystemModerationPlugin.find({})
    .sort({ updateTime: -1, _id: -1 })
    .lean<ModerationConfigRecord[]>();

/** 读取当前唯一启用的记录 */
export const findEnabledModerationConfig = (): Promise<ModerationConfigRecord | null> =>
  MongoSystemModerationPlugin.findOne({
    enabled: true,
    deleted: { $ne: true }
  })
    .sort({ updateTime: -1 })
    .lean<ModerationConfigRecord>();

/**
 * 写入一条配置记录（不存在则创建）。
 * 如果存在历史删除标记，安装或重新配置时会清除标记。
 */
export const upsertModerationConfig = ({
  pluginId,
  source = 'system',
  data,
  session
}: {
  pluginId: string;
  source?: string;
  data: Partial<ModerationPluginConfigType>;
  session?: ClientSession;
}) =>
  MongoSystemModerationPlugin.findOneAndUpdate(
    { pluginId, source },
    {
      $set: {
        ...data,
        deleted: false,
        deletedAt: null,
        deletedByTmbId: null,
        updateTime: new Date()
      },
      $setOnInsert: { pluginId, source }
    },
    { upsert: true, new: true, session }
  ).lean();

/** 更新已有记录的基础字段 */
export const updateModerationConfig = ({
  pluginId,
  source,
  data,
  session
}: {
  pluginId: string;
  source?: string;
  data: Partial<ModerationPluginConfigType>;
  session?: ClientSession;
}) =>
  MongoSystemModerationPlugin.findOneAndUpdate(
    { pluginId, ...(source ? { source } : {}) },
    { $set: { ...data, updateTime: new Date() } },
    { new: true, session }
  ).lean();

/** 停用除指定插件外的所有记录。启用互斥的写侧执行点 */
export const disableOtherModerationConfigs = ({
  exceptPluginId,
  session
}: {
  exceptPluginId: string;
  session?: ClientSession;
}) =>
  MongoSystemModerationPlugin.updateMany(
    { enabled: true, pluginId: { $ne: exceptPluginId } },
    { $set: { enabled: false, updateTime: new Date() } },
    { session }
  );

/** 停用所有审查插件记录 */
export const disableAllModerationConfigs = ({ session }: { session?: ClientSession } = {}) =>
  MongoSystemModerationPlugin.updateMany(
    { enabled: true },
    { $set: { enabled: false, updateTime: new Date() } },
    { session }
  );

/** 启用单个审查插件并停用其他所有插件 */
export const enableSingleModerationConfig = async ({
  pluginId,
  source,
  session
}: {
  pluginId: string;
  source?: string;
  session?: ClientSession;
}) => {
  await MongoSystemModerationPlugin.updateOne(
    { pluginId, ...(source ? { source } : {}) },
    {
      $set: { enabled: true, deleted: false, updateTime: new Date() },
      $setOnInsert: { pluginId, ...(source ? { source } : {}) }
    },
    { upsert: true, session }
  );
  await disableOtherModerationConfigs({ exceptPluginId: pluginId, session });
};

/** Soft-uninstall without discarding credentials or version selection. */
export const softDeleteModerationConfig = ({
  pluginId,
  source,
  session
}: ModerationConfigQuery & { session?: ClientSession }) =>
  MongoSystemModerationPlugin.findOneAndUpdate(
    {
      pluginId,
      ...(source && source !== 'system'
        ? { source }
        : { $or: [{ source: 'system' }, { source: { $exists: false } }] })
    },
    { $set: { deleted: true, enabled: false, deletedAt: new Date(), updateTime: new Date() } },
    { upsert: true, new: true, session }
  ).lean();

/** Restore only tombstones, preserving credentials and never enabling moderation implicitly. */
export const restoreModerationConfigs = ({
  pluginIds,
  source = 'system'
}: {
  pluginIds: string[];
  source?: string;
}) =>
  MongoSystemModerationPlugin.updateMany(
    {
      pluginId: { $in: pluginIds },
      deleted: true,
      ...(source === 'system' ? { $or: [{ source }, { source: { $exists: false } }] } : { source })
    },
    {
      $set: { deleted: false, enabled: false, updateTime: new Date() },
      $unset: { deletedAt: '', deletedByTmbId: '' }
    }
  );
