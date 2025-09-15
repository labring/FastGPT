import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { EvalMetricTypeValues } from '@fastgpt/global/core/evaluation/metric/constants';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/metric/type';

const { Schema } = connectionMongo;

export const EvalMetricCollectionName = 'eval_metrics';

const EvalMetricSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: false
  },
  type: {
    type: String,
    enum: EvalMetricTypeValues,
    required: true
  },
  prompt: {
    type: String,
    required: false
  },

  userInputRequired: {
    type: Boolean,
    default: false
  },

  actualOutputRequired: {
    type: Boolean,
    default: false
  },

  expectedOutputRequired: {
    type: Boolean,
    default: false
  },
  contextRequired: {
    type: Boolean,
    default: false
  },
  retrievalContextRequired: {
    type: Boolean,
    default: false
  },

  embeddingRequired: {
    type: Boolean,
    default: false
  },
  llmRequired: {
    type: Boolean,
    default: false
  },

  createTime: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    required: true,
    default: () => new Date()
  }
});

EvalMetricSchema.index({ teamId: 1, name: 1 }, { unique: true });
EvalMetricSchema.index({ createTime: -1 });

EvalMetricSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

EvalMetricSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  this.set({ updateTime: new Date() });
  next();
});

export const MongoEvalMetric = getMongoModel<EvalMetricSchemaType>(
  EvalMetricCollectionName,
  EvalMetricSchema
);
