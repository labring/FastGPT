import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import type { SystemModelItemType } from '../type';

// ═══ 对应 zod: BaseModelItemSchema ═══
const BaseModelFields = {
  model: { type: String, required: true },
  type: { type: String },
  provider: { type: String },
  name: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean },
  isCustom: { type: Boolean },
  isTuned: { type: Boolean },
  isDefault: { type: Boolean },
  requestUrl: { type: String },
  requestAuth: { type: String },
  testMode: { type: Boolean },
  tmbId: { type: Schema.Types.ObjectId, ref: TeamMemberCollectionName },
  teamId: { type: Schema.Types.ObjectId, ref: TeamCollectionName },
  isShared: { type: Boolean, default: false }
};

// ═══ 对应 zod: PriceTypeSchema ═══
const PriceFields = {
  charsPointsPrice: { type: Number },
  priceTiers: { type: [Schema.Types.Mixed] },
  /** @deprecated */ inputPrice: { type: Number },
  /** @deprecated */ outputPrice: { type: Number }
};

// ═══ 对应 zod: LLMModelItemSchema ═══
const LLMFields = {
  maxContext: { type: Number },
  maxResponse: { type: Number },
  quoteMaxToken: { type: Number },
  maxTemperature: { type: Number },
  showTopP: { type: Boolean },
  responseFormatList: { type: [String] },
  showStopSign: { type: Boolean },
  censor: { type: Boolean },
  vision: { type: Boolean },
  reasoning: { type: Boolean },
  functionCall: { type: Boolean },
  toolChoice: { type: Boolean },
  defaultSystemChatPrompt: { type: String },
  defaultConfig: { type: Schema.Types.Mixed },
  fieldMap: { type: Schema.Types.Mixed },
  isDefaultDatasetTextModel: { type: Boolean },
  isDefaultDatasetImageModel: { type: Boolean },
  isDefaultEvaluationModel: { type: Boolean },
  isDefaultHelperBotModel: { type: Boolean },
  /** @deprecated */ datasetProcess: { type: Boolean },
  /** @deprecated */ usedInClassify: { type: Boolean },
  /** @deprecated */ usedInExtractFields: { type: Boolean },
  /** @deprecated */ usedInToolCall: { type: Boolean },
  /** @deprecated */ useInEvaluation: { type: Boolean }
};

// ═══ 对应 zod: EmbeddingModelItemSchema ═══
const EmbeddingFields = {
  defaultToken: { type: Number },
  maxToken: { type: Number },
  weight: { type: Number },
  hidden: { type: Boolean },
  normalization: { type: Boolean },
  dimensions: { type: Number },
  batchSize: { type: Number },
  dbConfig: { type: Schema.Types.Mixed },
  queryConfig: { type: Schema.Types.Mixed },
  instruction: { type: String },
  supportTrain: { type: Boolean },
  trainTaskList: { type: [Schema.Types.Mixed] }
};

// ═══ 对应 zod: TTSModelItemSchema ═══
const TTSFields = {
  voices: { type: [Schema.Types.Mixed] }
};

// ═══ 组合: SystemModelItemType = LLM | Embedding | TTS | STT | Rerank ═══
const SystemModelSchema = new Schema({
  ...BaseModelFields,
  ...PriceFields,
  ...LLMFields,
  ...EmbeddingFields,
  ...TTSFields
});

SystemModelSchema.index({ teamId: 1 });
SystemModelSchema.index({ tmbId: 1 });
SystemModelSchema.index({ isShared: 1 });

export const MongoSystemModel = getMongoModel<SystemModelItemType>(
  'system_models',
  SystemModelSchema
);
