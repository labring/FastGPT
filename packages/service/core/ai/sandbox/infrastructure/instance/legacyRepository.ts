/**
 * Legacy Sandbox 实例数据访问层。
 *
 * 只封装旧集合的查询、迁移阶段提交和删除，不判断迁移顺序或执行远端副作用。
 */
import type { ClientSession } from '../../../../../common/mongo';
import { MongoLegacySandboxInstance, type LegacySandboxInstanceSchemaType } from './legacySchema';

type LegacySandboxMetadata = NonNullable<LegacySandboxInstanceSchemaType['metadata']>;
type LegacyArchiveState = NonNullable<LegacySandboxMetadata['archive']>;
type LegacyMigrationState = NonNullable<LegacySandboxMetadata['userLevelMigration']>;

/** 按稳定顺序读取完整 Legacy 集合，交给 application 做全表 preflight 校验。 */
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
