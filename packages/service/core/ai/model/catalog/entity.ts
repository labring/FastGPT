import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { Types, type ClientSession } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { MongoAIModelCatalog } from './schema';
import { ModelDefaultIdsSchema, type ModelDefaultIds } from '@fastgpt/global/core/ai/model/default';
import { MongoAIModel } from '../schema';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

/** 运行时模型目录必须显式声明作用域；团队目录不能缺省成系统目录。 */
export type ModelCatalogScope =
  | { scope: ModelScopeEnum.system }
  | { scope: ModelScopeEnum.team; teamId: string };

/** 目录身份用于模型查询和版本记录，禁止无效团队身份触发跨域读取。 */
const getCatalogFilter = (context: ModelCatalogScope) => {
  if (context.scope === ModelScopeEnum.system) return { scope: ModelScopeEnum.system };
  if (!Types.ObjectId.isValid(context.teamId)) throw new UserError(ModelErrEnum.unExist);
  return { scope: ModelScopeEnum.team, teamId: context.teamId };
};

/** 在调用方提供的事务中递增目录版本，不自行决定业务事务边界。 */
export const incrementModelCatalogRevision = (context: ModelCatalogScope, session: ClientSession) =>
  MongoAIModelCatalog.updateOne(
    getCatalogFilter(context),
    { $inc: { catalogRevision: 1 }, $setOnInsert: { defaultModelIds: {} } },
    { upsert: true, session }
  );

/** 读取目录中的系统默认槽位；没有记录时返回空配置，由运行时按模型类型回退。 */
export const findSystemDefaultModelIds = async (): Promise<ModelDefaultIds> => {
  const document = await MongoAIModelCatalog.findOne({ scope: ModelScopeEnum.system }).lean();
  return document ? ModelDefaultIdsSchema.parse(document.defaultModelIds) : {};
};

/** 写入目录中的系统默认槽位；透传上层事务，不单独修改目录修订号。 */
export const upsertSystemDefaultModelIds = (
  defaultModelIds: ModelDefaultIds,
  session?: ClientSession
) =>
  MongoAIModelCatalog.findOneAndUpdate(
    { scope: ModelScopeEnum.system },
    {
      $set: { defaultModelIds },
      $setOnInsert: { scope: ModelScopeEnum.system }
    },
    { session, upsert: true }
  );

/** 主节点上的权威修订号；线性化读取失败时不能把旧进程缓存当成最新目录。 */
export const readModelCatalogRevision = async (context: ModelCatalogScope) => {
  const record = await MongoAIModelCatalog.findOne(getCatalogFilter(context))
    .select({ catalogRevision: 1 })
    .read('primary')
    .readConcern('linearizable')
    .maxTimeMS(10000)
    .lean();
  return record?.catalogRevision ?? 0;
};

/** 模型、默认配置和修订号必须属于同一个快照，不能将新版本号标记到旧数据上。 */
export const readModelCatalogSnapshot = (context: ModelCatalogScope) =>
  mongoSessionRun(
    async (session) => {
      const filter = getCatalogFilter(context);
      const defaults = await MongoAIModelCatalog.findOne(filter).session(session).lean();
      const models = await MongoAIModel.find(filter).sort({ _id: -1 }).session(session).lean();
      return {
        models,
        defaultModelIds: ModelDefaultIdsSchema.parse(defaults?.defaultModelIds ?? {}),
        revision: defaults?.catalogRevision ?? 0
      };
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
  );
