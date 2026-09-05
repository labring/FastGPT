import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';

const { Schema } = connectionMongo;

export const AIDefaultModelCollectionName = 'ai_default_models';

export type AIDefaultModelSchemaType = {
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

const AIDefaultModelSchema = new Schema<AIDefaultModelSchemaType>({
  catalogRevision: { type: Number, default: 0 },
  scope: {
    type: String,
    enum: Object.values(ModelScopeEnum),
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    required(this: AIDefaultModelSchemaType) {
      return this.scope === ModelScopeEnum.team;
    }
  },
  defaultModelIds: {
    type: DefaultModelIdsSchema,
    required: true,
    default: () => ({})
  }
});

// 系统作用域没有 owner ID，只能存在一条默认模型配置。
defineIndex(AIDefaultModelSchema, {
  key: { scope: 1 },
  options: {
    unique: true,
    partialFilterExpression: { scope: ModelScopeEnum.system }
  }
});

// 预留团队安装模型：每个团队在 team scope 下只能有一条默认模型配置。
defineIndex(AIDefaultModelSchema, {
  key: { scope: 1, teamId: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      scope: ModelScopeEnum.team,
      teamId: { $exists: true }
    }
  }
});

export const MongoAIDefaultModel = getMongoModel<AIDefaultModelSchemaType>(
  AIDefaultModelCollectionName,
  AIDefaultModelSchema
);
