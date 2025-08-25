import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvalDatasetSchemaType } from '@fastgpt/global/core/evaluation/type';
const { Schema } = connectionMongo;

const DatasetColumnSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['string', 'number', 'boolean'], required: true },
  required: { type: Boolean, default: false },
  description: String
});

const DatasetItemSchema = new Schema(
  {
    userInput: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    context: [String],
    globalVariables: { type: Object, default: {} }
  },
  { strict: false }
); // 允许动态字段

const EvalDatasetSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true,
    index: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  name: { type: String, required: true },
  description: String,
  dataFormat: { type: String, enum: ['csv', 'json'], default: 'csv' },
  columns: [DatasetColumnSchema],
  dataItems: [DatasetItemSchema],
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

// 索引
EvalDatasetSchema.index({ teamId: 1, name: 1 });
EvalDatasetSchema.index({ createTime: -1 });

// 中间件：更新时自动设置 updateTime
EvalDatasetSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

EvalDatasetSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  this.set({ updateTime: new Date() });
  next();
});

export const EvalDatasetCollectionName = 'eval_datasets';

export const MongoEvalDataset = getMongoModel<EvalDatasetSchemaType>(
  EvalDatasetCollectionName,
  EvalDatasetSchema
);
