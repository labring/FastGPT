import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvaluationMetricSchemaType } from '@fastgpt/global/core/evaluation/type';
const { Schema } = connectionMongo;

export const EvaluationMetricSchema = new Schema({
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
  type: { type: String, enum: ['ai_model'], required: true },
  config: {
    type: Schema.Types.Mixed,
    required: false
  },
  dependencies: {
    type: [String],
    enum: ['llm', 'embedding'],
    default: [],
    required: false
  },
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

EvaluationMetricSchema.index({ teamId: 1, name: 1 });
EvaluationMetricSchema.index({ type: 1 });
EvaluationMetricSchema.index({ createTime: -1 });

// Automatically set updateTime on update
EvaluationMetricSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

EvaluationMetricSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  this.set({ updateTime: new Date() });
  next();
});

export const EvalMetricCollectionName = 'eval_metrics';

export const MongoEvalMetric = getMongoModel<EvaluationMetricSchemaType>(
  EvalMetricCollectionName,
  EvaluationMetricSchema
);
