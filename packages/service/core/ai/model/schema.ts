import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import type { SystemModelItemType, DefaultModelConfig } from './type';

// ═══ Base fields shared by all model types ═══
// Corresponds to zod: BaseModelItemSchema
const BaseModelFields = {
  model: { type: String, required: true }, // provider-side model name, e.g. "gpt-4o"
  type: { type: String }, // llm | embedding | tts | stt | rerank
  provider: { type: String }, // model provider identifier
  name: { type: String }, // platform display name / alias
  avatar: { type: String }, // provider icon URL

  isActive: { type: Boolean }, // whether the model is enabled
  isSystem: { type: Boolean }, // system model (created by root, platform-wide public)
  testMode: { type: Boolean }, // test mode flag

  // Note: tmbId and teamId only stored for private models (isSystem: false)
  tmbId: { type: Schema.Types.ObjectId, ref: TeamMemberCollectionName },
  teamId: { type: Schema.Types.ObjectId, ref: TeamCollectionName }
};

// ═══ Price fields (shared by all model types) ═══
const PriceFields = {
  charsPointsPrice: { type: Number },
  priceTiers: { type: [Schema.Types.Mixed] },

  /** @deprecated legacy billing fields */
  inputPrice: { type: Number },
  /** @deprecated */
  outputPrice: { type: Number }
};

// Type-specific fields (maxContext, voices, maxToken, dimensions, etc.) are not declared here.
// They are cleaned by normalizeSystemModel() via Zod schema before write.
// strict: false allows these fields to be written to MongoDB.
const SystemModelSchema = new Schema(
  {
    ...BaseModelFields,
    ...PriceFields
  },
  {
    strict: false, // allow type-specific fields to be stored dynamically
    timestamps: true // auto-manage createdAt, updatedAt
  }
);

// Register the legacy constraint only so index synchronization can remove it precisely.
defineIndex(SystemModelSchema, {
  key: { model: 1 },
  options: { unique: true },
  deprecated: true
});
defineIndex(SystemModelSchema, { key: { teamId: 1 } });
defineIndex(SystemModelSchema, { key: { tmbId: 1 } });
defineIndex(SystemModelSchema, { key: { isActive: 1, provider: 1 } });

export const MongoSystemModel = getMongoModel<SystemModelItemType>(
  'system_models',
  SystemModelSchema
);

// ═══ Default models table — default_models ═══
const DefaultModelSchema = new Schema(
  {
    llmId: { type: String },
    embeddingId: { type: String },
    ttsId: { type: String },
    sttId: { type: String },
    rerankId: { type: String },
    datasetTextLLMId: { type: String },
    datasetImageLLMId: { type: String },
    chatTitleLLMId: { type: String },
    helperBotLLMId: { type: String }
  },
  { timestamps: true }
);

export const MongoDefaultModel = getMongoModel<DefaultModelConfig>(
  'default_models',
  DefaultModelSchema
);
