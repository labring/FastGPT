import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoAIDefaultModel } from '../defaultModel/schema';
import { ModelDefaultIdsSchema } from '@fastgpt/global/core/ai/defaultModel';
import { MongoAIModel } from './schema';

/** 目录修订号与模型写入使用同一事务，避免数据成功但失效通知丢失。外部 I/O 不得放入回调。 */
export const runSystemModelTransaction = <T>(write: (session: ClientSession) => Promise<T>) =>
  mongoSessionRun(
    async (session) => {
      // 所有目录写入先竞争同一文档，事务重试后重新执行依赖当前模型状态的校验。
      await MongoAIDefaultModel.updateOne(
        { scope: ModelScopeEnum.system },
        { $inc: { catalogRevision: 1 }, $setOnInsert: { defaultModelIds: {} } },
        { upsert: true, session }
      );
      return write(session);
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
  );

/** 主节点上的权威修订号；线性化读取失败时不能把旧进程缓存当成最新目录。 */
export const readSystemModelRevision = async () => {
  const record = await MongoAIDefaultModel.findOne({ scope: ModelScopeEnum.system })
    .select({ catalogRevision: 1 })
    .read('primary')
    .readConcern('linearizable')
    .maxTimeMS(10000)
    .lean();
  return record?.catalogRevision ?? 0;
};

/** 模型、默认配置和修订号必须属于同一个快照，不能将新版本号标记到旧数据上。 */
export const readSystemModelSnapshot = () =>
  mongoSessionRun(
    async (session) => {
      const defaults = await MongoAIDefaultModel.findOne({ scope: ModelScopeEnum.system })
        .session(session)
        .lean();
      const models = await MongoAIModel.find({ scope: ModelScopeEnum.system })
        .sort({ _id: -1 })
        .session(session)
        .lean();
      return {
        models,
        defaultModelIds: ModelDefaultIdsSchema.parse(defaults?.defaultModelIds ?? {}),
        revision: defaults?.catalogRevision ?? 0
      };
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
  );
