import type {
  SqlFullTextMetadata,
  SqlFullTextProvider
} from '@fastgpt/global/core/dataset/fullText/schema';
import type { ClientSession } from '../../../../common/mongo';
import { MongoSqlFullTextTarget, type SqlFullTextTarget } from './schema';

/**
 * 从主库读取指定 SQL provider 当前登记的全文就绪目标记录。
 */
export const findSqlFullTextTargetById = (
  provider: SqlFullTextProvider,
  session?: ClientSession
): Promise<SqlFullTextTarget | null> =>
  MongoSqlFullTextTarget.findById(provider, undefined, { session }).read('primary').lean();

/**
 * 标记当前 provider 对应的物理 SQL 目标已完成历史回填和全量验收，允许切换原生全文读取。
 */
export const activateSqlFullTextTarget = async (
  {
    provider,
    targetId,
    schemaVersion,
    analyzerVersion
  }: {
    provider: SqlFullTextProvider;
  } & SqlFullTextMetadata,
  session?: ClientSession
) => {
  await MongoSqlFullTextTarget.updateOne(
    { _id: provider },
    {
      $set: {
        targetId,
        schemaVersion,
        analyzerVersion
      }
    },
    { upsert: true, session }
  );
};

/**
 * 清理指定 provider 的全文切读就绪标记；重跑预检/回填期间回退至兼容读取。
 */
export const clearSqlFullTextTargetReady = async (
  provider: SqlFullTextProvider,
  session?: ClientSession
) => {
  await MongoSqlFullTextTarget.deleteOne({ _id: provider }, { session });
};
