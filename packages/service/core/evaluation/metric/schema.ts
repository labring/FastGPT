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
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
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
    required: false
  },

  actualOutputRequired: {
    type: Boolean,
    required: false
  },

  expectedOutputRequired: {
    type: Boolean,
    required: false
  },
  contextRequired: {
    type: Boolean,
    required: false
  },
  retrievalContextRequired: {
    type: Boolean,
    required: false
  },

  embeddingRequired: {
    type: Boolean,
    required: false
  },
  llmRequired: {
    type: Boolean,
    required: false
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
EvalMetricSchema.index({ updateTime: -1 });

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
