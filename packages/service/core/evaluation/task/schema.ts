import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type {
  EvaluationSchemaType,
  EvalItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { UsageCollectionName } from '../../../support/wallet/usage/schema';
import {
  EvaluationStatusEnum,
  EvaluationStatusValues
} from '@fastgpt/global/core/evaluation/constants';
import { EvalDatasetCollectionName } from '../dataset/schema';

const { Schema } = connectionMongo;

// Common target schema definition
const TargetSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['workflow'],
      required: true
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: function (config: any) {
          const targetType = (this as any).target?.type || (this as any).type;
          if (targetType === 'workflow') {
            return config && typeof config === 'object' && config.appId != null;
          }
          return false;
        },
        message: 'Target config must match the target type. Only workflow targets are supported.'
      }
    }
  },
  { _id: false }
);

// Evaluator schema definition
const EvaluatorSchema = new Schema(
  {
    metric: {
      type: Schema.Types.Mixed,
      required: true
    },
    runtimeConfig: {
      type: Schema.Types.Mixed,
      required: false,
      default: {}
    }
  },
  { _id: false }
);

// Collection names
export const EvaluationCollectionName = 'eval';
export const EvalItemCollectionName = 'eval_items';

// Evaluation Schema
const EvaluationSchema = new Schema({
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
  description: String,
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: EvalDatasetCollectionName,
    required: true
  },
  target: TargetSchema,
  evaluators: [EvaluatorSchema],
  usageId: {
    type: Schema.Types.ObjectId,
    ref: UsageCollectionName,
    required: true
  },
  status: {
    type: Number,
    enum: EvaluationStatusValues,
    default: EvaluationStatusEnum.queuing
  },
  createTime: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  finishTime: Date,
  avgScore: Number,
  errorMessage: String
});

EvaluationSchema.index({ teamId: 1 });
EvaluationSchema.index({ status: 1, createTime: -1 });
EvaluationSchema.index({ teamId: 1, status: 1 });

// Evaluation Item Schema (原子性：一个dataItem + 一个target + 一个evaluator)
const EvalItemSchema = new Schema({
  evalId: {
    type: Schema.Types.ObjectId,
    ref: EvaluationCollectionName,
    required: true
  },
  // 依赖的组件配置
  dataItem: {
    type: Object,
    required: true
  },
  target: TargetSchema,
  evaluator: EvaluatorSchema, // 单个evaluator配置
  // 运行结果
  target_output: {
    actualOutput: String,
    retrievalContext: [String],
    usage: Object,
    responseTime: Number
  },
  evaluator_output: {
    // 单个evaluator的结果
    metricId: String,
    metricName: String,
    score: Number,
    details: Object,
    error: String
  },
  status: {
    type: Number,
    default: EvaluationStatusEnum.queuing,
    enum: EvaluationStatusValues
  },
  retry: {
    type: Number,
    default: 3
  },
  finishTime: Date,
  errorMessage: String
});

EvalItemSchema.index({ evalId: 1, status: 1 });
EvalItemSchema.index({ status: 1, retry: 1 });
EvalItemSchema.index({ evalId: 1, finishTime: -1 });

// Export models
export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationSchema
);

export const MongoEvalItem = getMongoModel<EvalItemSchemaType>(
  EvalItemCollectionName,
  EvalItemSchema
);
