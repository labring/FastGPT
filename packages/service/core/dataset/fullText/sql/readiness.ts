import { SQL_FULL_TEXT_MIGRATION_ID } from '@fastgpt/global/core/dataset/fullText/constants';
import {
  SqlFullTextMetadataSchema,
  SqlFullTextProviderSchema
} from '@fastgpt/global/core/dataset/fullText/schema';
import {
  SystemMigrationCollectionName,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import { connectionMongo } from '../../../../common/mongo';
import { getVectorType } from '../../../../common/vectorDB/constants';
import { getFullTextProvider } from '../../../../common/vectorDB/fullText/config';
import { getSqlFullTextAdapter } from '../../../../common/vectorDB/fullText/controller';
import { findSqlFullTextTargetById } from './entity';

const AcceptedTargetSchema = SqlFullTextMetadataSchema.extend({
  provider: SqlFullTextProviderSchema
});
const retryIntervalMs = 5_000;
type SqlFullTextReadiness = {
  ready: boolean;
  started: boolean;
  checking?: Promise<boolean>;
};

declare global {
  var datasetSqlFullTextReadiness: SqlFullTextReadiness | undefined;
}

// Next.js 启动入口和 API 路由可能各自打包同一模块，需在进程内共享状态。
const readiness = (globalThis.datasetSqlFullTextReadiness ??= { ready: false, started: false });

/** 查询只读取本进程已核验的状态，判断路径无需访问 Mongo 和 SQL。 */
export const isSqlFullTextTargetReady = () => readiness.ready;

/**
 * Runner 提交成功后才核对验收记录及当前物理库。prepare 写入的库元数据和脚本
 * 提前登记的目标都不能独立放行，避免未成功的任务切读。
 */
export const refreshSqlFullTextTargetReady = (): Promise<boolean> => {
  readiness.checking ??= (async () => {
    const provider = getVectorType();
    if (provider === 'milvus' || getFullTextProvider() === 'mongo') return false;
    const state = await connectionMongo.connection.db
      ?.collection<{
        _id: string;
        status: SystemMigrationStatusEnum;
        result?: unknown;
      }>(SystemMigrationCollectionName)
      .findOne(
        { _id: SQL_FULL_TEXT_MIGRATION_ID, status: SystemMigrationStatusEnum.succeeded },
        { projection: { result: 1 }, readPreference: 'primary' }
      );
    const accepted = AcceptedTargetSchema.safeParse(state?.result);
    if (!accepted.success || accepted.data.provider !== provider) return false;
    const target = await findSqlFullTextTargetById(provider);
    if (
      target?.targetId !== accepted.data.targetId ||
      target.schemaVersion !== accepted.data.schemaVersion ||
      target.analyzerVersion !== accepted.data.analyzerVersion
    )
      return false;

    const metadata = await getSqlFullTextAdapter(provider).getMetadata();
    return (
      metadata.targetId === target.targetId &&
      metadata.schemaVersion === target.schemaVersion &&
      metadata.analyzerVersion === target.analyzerVersion
    );
  })()
    .catch(() => false)
    .then((result) => (readiness.ready = result))
    .finally(() => {
      readiness.checking = undefined;
    });
  return readiness.checking;
};

/** App/Pro 均在向量存储初始化时启动检查，仅未就绪时低频复查，成功后停止。 */
export const startSqlFullTextReadiness = () => {
  const provider = getFullTextProvider();
  if (readiness.started || provider === 'mongo' || provider === 'milvus') return;
  readiness.started = true;
  const check = async () => {
    if (!(await refreshSqlFullTextTargetReady())) {
      setTimeout(() => void check(), retryIntervalMs).unref();
    }
  };
  void check();
};
