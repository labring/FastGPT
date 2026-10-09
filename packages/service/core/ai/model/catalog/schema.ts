import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/model/default';
import { connectionMongo, defineIndex, getMongoModel } from '../../../../common/mongo';

const { Schema } = connectionMongo;

// 历史集合名保持不变，目录状态包含修订号与系统默认槽位；无需迁移旧数据或索引。
export const AIModelCatalogCollectionName = 'ai_default_models';

export type AIModelCatalogSchemaType = {
  _id: string;
  scope: ModelScopeEnum;
  teamId?: string;
  defaultModelIds: ModelDefaultIds;
  /** 与模型写入事务共同提交的目录修订号；历史数据按 0 处理。 */
  catalogRevision?: number;
};

const DefaultModelIdsSchema = new Schema(
  {
    llm: String,
    embedding: String,
    tts: String,
    stt: String,
    rerank: String,
    datasetTextLLM: String,
    datasetImageLLM: String,
    chatTitleLLM: String
  },
  { _id: false }
);

const AIModelCatalogSchema = new Schema<AIModelCatalogSchemaType>({
  catalogRevision: { type: Number, default: 0 },
  scope: {
    type: String,
    enum: Object.values(ModelScopeEnum),
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    required(this: AIModelCatalogSchemaType) {
      return this.scope === ModelScopeEnum.team;
    }
  },
  defaultModelIds: {
    type: DefaultModelIdsSchema,
    required: true,
    default: () => ({})
  }
});

// 系统目录只有一条状态记录，同时保存系统默认模型配置。
defineIndex(AIModelCatalogSchema, {
  key: { scope: 1 },
  options: {
    unique: true,
    partialFilterExpression: { scope: ModelScopeEnum.system }
  }
});

// 每个团队独立保存目录修订号；团队运行时默认槽位继续继承系统配置。
defineIndex(AIModelCatalogSchema, {
  key: { scope: 1, teamId: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      scope: ModelScopeEnum.team,
      teamId: { $exists: true }
    }
  }
});

export const MongoAIModelCatalog = getMongoModel<AIModelCatalogSchemaType>(
  AIModelCatalogCollectionName,
  AIModelCatalogSchema
);
