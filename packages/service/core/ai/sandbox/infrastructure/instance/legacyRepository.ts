/**
 * Legacy Sandbox 实例数据访问层。
 *
 * 只封装旧集合的查询、迁移阶段提交和删除，不判断迁移顺序或执行远端副作用。
 */
import type { ClientSession, Types } from '../../../../../common/mongo';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SandboxResourceRef } from './repository';
import { MongoLegacySandboxInstance, type LegacySandboxInstanceSchemaType } from './legacySchema';

type LegacySandboxMetadata = NonNullable<LegacySandboxInstanceSchemaType['metadata']>;
type LegacyArchiveState = NonNullable<LegacySandboxMetadata['archive']>;
type LegacyMigrationState = NonNullable<LegacySandboxMetadata['userLevelMigration']>;

export type LegacySandboxNormalizationDoc = SandboxResourceRef & {
  _id: Types.ObjectId;
  appId?: string | null;
  type?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: {
    skillId?: string | null;
  };
};

export type LegacySandboxSourceUpdate = {
  id: Types.ObjectId;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
};

const buildMissingLegacySandboxSourceQuery = () => ({
  $or: [
    { sourceType: { $exists: false } },
    { sourceType: { $exists: true, $nin: Object.values(ChatSourceTypeEnum) } },
    { sourceId: { $exists: false } },
    { sourceId: { $in: ['', null] } }
  ]
});

const buildLegacySandboxFieldCleanupQuery = () => ({
  sourceType: { $in: Object.values(ChatSourceTypeEnum) },
  sourceId: { $exists: true, $nin: ['', null] },
  $or: [
    { appId: { $exists: true } },
    { 'metadata.skillId': { $exists: true } },
    { type: { $exists: true } }
  ]
});

/** 统计 beta6 归一化仍需处理的 Legacy 记录，作为 Workspace 归档前的阶段屏障。 */
export const countPendingLegacySandboxNormalizations = () =>
  MongoLegacySandboxInstance.collection.countDocuments({
    $or: [
      buildMissingLegacySandboxSourceQuery(),
      { appId: { $exists: true } },
      { 'metadata.skillId': { $exists: true } },
      { type: { $exists: true } }
    ]
  });

/** 读取缺失标准 source 归属的原始 Legacy 记录，供 beta6 归一化阶段分类。 */
export const findLegacySandboxesPendingSourceNormalization = () =>
  MongoLegacySandboxInstance.collection
    .find(buildMissingLegacySandboxSourceQuery(), {
      projection: {
        _id: 1,
        appId: 1,
        type: 1,
        provider: 1,
        sandboxId: 1,
        sourceType: 1,
        sourceId: 1,
        status: 1,
        lastActiveAt: 1,
        metadata: 1
      }
    })
    .toArray() as Promise<LegacySandboxNormalizationDoc[]>;

/** 批量补齐 Legacy source 归属并同步移除 beta6 废弃字段。 */
export const updateLegacySandboxSources = (operations: LegacySandboxSourceUpdate[]) => {
  if (operations.length === 0) return undefined;
  return MongoLegacySandboxInstance.collection.bulkWrite(
    operations.map((operation) => ({
      updateOne: {
        filter: { _id: operation.id },
        update: {
          $set: {
            sourceType: operation.sourceType,
            sourceId: operation.sourceId
          },
          $unset: {
            appId: '',
            'metadata.skillId': '',
            type: ''
          }
        }
      }
    }))
  );
};

/** 清理已经具备标准 source 归属但仍残留的 beta6 废弃字段。 */
export const cleanupNormalizedLegacySandboxFields = () =>
  MongoLegacySandboxInstance.collection.updateMany(buildLegacySandboxFieldCleanupQuery(), {
    $unset: {
      appId: '',
      'metadata.skillId': '',
      type: ''
    }
  });

/** 统计只需清理 beta6 废弃字段的 Legacy 记录。 */
export const countLegacySandboxFieldCleanups = () =>
  MongoLegacySandboxInstance.collection.countDocuments(buildLegacySandboxFieldCleanupQuery());

/** beta6 阶段归零后，按稳定顺序读取完整 Legacy 集合。 */
export const findAllLegacySandboxInstanceRecords = () =>
  MongoLegacySandboxInstance.collection.find({}).sort({ lastActiveAt: -1, _id: 1 }).toArray();

/** 按 source 查询 Source 删除流程需要清理的 Legacy 实例。 */
export const findLegacySandboxInstancesBySource = (params: {
  sourceType: LegacySandboxInstanceSchemaType['sourceType'];
  sourceId: string;
}) => MongoLegacySandboxInstance.find(params).lean<LegacySandboxInstanceSchemaType[]>();

/** 提交单条 Legacy 记录的用户级迁移阶段。 */
export const updateLegacySandboxMigrationState = (
  params: { id: LegacySandboxInstanceSchemaType['_id']; state: LegacyMigrationState },
  session?: ClientSession
) =>
  MongoLegacySandboxInstance.updateOne(
    { _id: params.id },
    { $set: { 'metadata.userLevelMigration': params.state } },
    { session }
  );

/** 在删除远端资源前提交 Legacy archive deleting 状态。 */
export const updateLegacySandboxArchiveState = (
  params: { id: LegacySandboxInstanceSchemaType['_id']; archive: LegacyArchiveState },
  session?: ClientSession
) =>
  MongoLegacySandboxInstance.updateOne(
    { _id: params.id },
    { $set: { 'metadata.archive': params.archive } },
    { session }
  );

/** 原子提交 Legacy 归档完成事实和下一迁移阶段。 */
export const completeLegacySandboxArchive = (
  params: {
    id: LegacySandboxInstanceSchemaType['_id'];
    status: LegacySandboxInstanceSchemaType['status'];
    archive: LegacyArchiveState;
    migration: LegacyMigrationState;
  },
  session?: ClientSession
) =>
  MongoLegacySandboxInstance.updateOne(
    { _id: params.id },
    {
      $set: {
        status: params.status,
        'metadata.archive': params.archive,
        'metadata.userLevelMigration': params.migration
      }
    },
    { session }
  );

/** 删除 Source 清理已经完成远端和 S3 清理的 Legacy 记录。 */
export const deleteLegacySandboxInstanceRecord = (
  id: LegacySandboxInstanceSchemaType['_id'],
  session?: ClientSession
) => MongoLegacySandboxInstance.deleteOne({ _id: id }, { session });
