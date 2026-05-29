import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import type { SystemModelItemType } from '../type';

// ═══ 所有模型类型共享的 base 字段 ═══
// 对应 zod: BaseModelItemSchema
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

// ═══ 价格字段 (所有模型类型共享) ═══
// 对应 zod: PriceTypeSchema
const PriceFields = {
  charsPointsPrice: { type: Number },
  priceTiers: { type: [Schema.Types.Mixed] },
  /** @deprecated */ inputPrice: { type: Number },
  /** @deprecated */ outputPrice: { type: Number }
};

// 类型特有字段 (如 maxContext, voices, maxToken 等) 不在此声明，
// 由 normalizeSystemModel() 在写入前通过 Zod schema 清洗后动态存储。
// strict: false 允许这些字段写入 MongoDB。
const SystemModelSchema = new Schema(
  {
    ...BaseModelFields,
    ...PriceFields
  },
  { strict: false }
);

SystemModelSchema.index({ teamId: 1 });
SystemModelSchema.index({ tmbId: 1 });
SystemModelSchema.index({ isShared: 1 });

export const MongoSystemModel = getMongoModel<SystemModelItemType>(
  'system_models',
  SystemModelSchema
);
