import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvaluationDatasetSchemaType } from '@fastgpt/global/core/evaluation/type';
const { Schema } = connectionMongo;

export const EvaluationDatasetColumnSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['string', 'number', 'boolean'], required: true },
  required: { type: Boolean, default: false },
  description: String
});

export const EvaluationDatasetItemSchema = new Schema(
  {
    userInput: { type: String, required: true },
    expectedOutput: { type: String, required: true },
    context: [String],
    globalVariables: { type: Object, default: {} }
  },
  { strict: false }
); // Allow dynamic fields

export const EvaluationDatasetSchema = new Schema({
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
  columns: [EvaluationDatasetColumnSchema],
  dataItems: [EvaluationDatasetItemSchema],
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

EvaluationDatasetSchema.index({ teamId: 1, name: 1 });
EvaluationDatasetSchema.index({ createTime: -1 });

// Automatically set updateTime on update
EvaluationDatasetSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

EvaluationDatasetSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  this.set({ updateTime: new Date() });
  next();
});

export const EvalDatasetCollectionName = 'eval_datasets';

export const MongoEvalDataset = getMongoModel<EvaluationDatasetSchemaType>(
  EvalDatasetCollectionName,
  EvaluationDatasetSchema
);
