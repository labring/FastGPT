import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { UsageCollectionName } from '../../../support/wallet/usage/schema';
import {
  EvaluationStatusEnum,
  EvaluationStatusValues,
  SummaryStatusValues,
  SummaryStatusEnum,
  CalculateMethodEnum,
  CaculateMethodValues
} from '@fastgpt/global/core/evaluation/constants';
import { EvalDatasetCollectionName } from '../dataset/evalDatasetCollectionSchema';

const { Schema } = connectionMongo;

export const EvaluationTargetSchema = new Schema(
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

export const EvaluationEvaluatorSchema = new Schema(
  {
    metric: {
      type: Schema.Types.Mixed,
      required: true
    },
    runtimeConfig: {
      type: Schema.Types.Mixed,
      required: false,
      default: {}
    },
    weight: {
      type: Number,
      required: false,
      default: 0
    },
    thresholdValue: {
      type: Number,
      required: false,
      default: 80
    },
    calculateType: {
      type: Number,
      enum: CaculateMethodValues,
      default: CalculateMethodEnum.mean
    },
    metricsScore: {
      type: Number,
      required: false
    },
    summary: {
      type: String,
      required: false
    },
    summaryStatus: {
      type: Number,
      enum: SummaryStatusValues,
      default: SummaryStatusEnum.pending
    },
    errorReason: {
      type: String,
      required: false
    }
  },
  { _id: false }
);

// Collection names
export const EvaluationCollectionName = 'evals';
export const EvalItemCollectionName = 'eval_items';

export const EvaluationTaskSchema = new Schema({
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
  target: EvaluationTargetSchema,
  evaluators: [EvaluationEvaluatorSchema],
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
  errorMessage: String,
  // Statistical information
  statistics: {
    totalItems: {
      type: Number,
      default: 0
    },
    completedItems: {
      type: Number,
      default: 0
    },
    errorItems: {
      type: Number,
      default: 0
    }
  }
});

EvaluationTaskSchema.index({ teamId: 1 });
EvaluationTaskSchema.index({ status: 1, createTime: -1 });
EvaluationTaskSchema.index({ teamId: 1, status: 1 });

// Atomic evaluation item: one dataItem + one target + one evaluator
export const EvaluationItemSchema = new Schema({
  evalId: {
    type: Schema.Types.ObjectId,
    ref: EvaluationCollectionName,
    required: true
  },
  // Dependent component configurations
  dataItem: {
    type: Object,
    required: true
  },
  target: EvaluationTargetSchema,
  evaluator: EvaluationEvaluatorSchema, // Single evaluator configuration
  // Execution results
  targetOutput: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function (output: any) {
        if (!output) return true; // Optional field
        return (
          typeof output.actualOutput === 'string' &&
          typeof output.responseTime === 'number' &&
          (!output.retrievalContext || Array.isArray(output.retrievalContext)) &&
          (!output.usage || typeof output.usage === 'object')
        );
      },
      message: 'targetOutput must conform to TargetOutput type'
    }
  },
  evaluatorOutput: {
    type: Schema.Types.Mixed,
    validate: {
      validator: function (output: any) {
        if (!output) return true; // Optional field
        return (
          typeof output.metricId === 'string' &&
          typeof output.metricName === 'string' &&
          typeof output.score === 'number' &&
          (!output.details || typeof output.details === 'object')
        );
      },
      message: 'evaluatorOutput must conform to MetricResult type'
    }
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

EvaluationItemSchema.index({ evalId: 1, status: 1 });
EvaluationItemSchema.index({ status: 1, retry: 1 });
EvaluationItemSchema.index({ evalId: 1, finishTime: -1 });

export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationTaskSchema
);

export const MongoEvalItem = getMongoModel<EvaluationItemSchemaType>(
  EvalItemCollectionName,
  EvaluationItemSchema
);
