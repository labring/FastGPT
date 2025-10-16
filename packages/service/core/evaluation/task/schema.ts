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
  CaculateMethodValues,
  CalculateMethodEnum
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
            return (
              config &&
              typeof config === 'object' &&
              config.appId != null &&
              config.versionId != null
            );
          }
          return false;
        },
        message:
          'Target config must match the target type. Workflow targets require appId and versionId.'
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
    thresholdValue: {
      type: Number,
      required: false,
      default: 0.8
    },
    scoreScaling: {
      type: Number,
      required: false,
      default: 1, // Default no scaling
      validate: {
        validator: function (value: number) {
          return (
            typeof value === 'number' &&
            !isNaN(value) &&
            isFinite(value) &&
            value > 0 &&
            value <= 10000
          ); // Support decimals like 0.01 for reduction
        },
        message:
          'Score scaling must be a positive number greater than 0 and less than or equal to 10000'
      }
    }
  },
  {
    _id: false
  }
);

/**
 * MongoDB collection names
 */
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
  evalDatasetCollectionId: {
    type: Schema.Types.ObjectId,
    ref: EvalDatasetCollectionName,
    required: true
  },
  target: EvaluationTargetSchema,
  evaluators: [EvaluationEvaluatorSchema],
  summaryData: {
    calculateType: {
      type: String,
      enum: CaculateMethodValues,
      required: true,
      default: CalculateMethodEnum.mean
    },
    summaryConfigs: [
      {
        metricId: {
          type: String,
          required: true
        },
        metricName: {
          type: String,
          required: true
        },
        weight: {
          type: Number,
          required: true
        },
        summary: {
          type: String,
          default: ''
        },
        summaryStatus: {
          type: String,
          enum: SummaryStatusValues,
          default: SummaryStatusEnum.pending
        },
        errorReason: {
          type: String,
          default: ''
        },
        _id: false
      }
    ]
  },
  usageId: {
    type: Schema.Types.ObjectId,
    ref: UsageCollectionName,
    required: true
  },
  createTime: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  finishTime: Date,
  errorMessage: String
});

/**
 * Optimized indexes based on query patterns
 */
EvaluationTaskSchema.index({ _id: 1, teamId: 1 }); // Primary lookup
EvaluationTaskSchema.index({ teamId: 1, createTime: -1 }); // Team listing with time sort
EvaluationTaskSchema.index({ teamId: 1, tmbId: 1, createTime: -1 }); // Permission filtering
EvaluationTaskSchema.index({ teamId: 1, name: 1 }, { unique: true }); // Name uniqueness

/**
 * Evaluation item schema: atomic unit for evaluation
 */
export const EvaluationItemSchema = new Schema({
  evalId: {
    type: Schema.Types.ObjectId,
    ref: EvaluationCollectionName,
    required: true
  },
  // Data item configuration
  dataItem: {
    type: Object,
    required: true
  },
  // Execution results and outputs
  targetOutput: {
    type: Schema.Types.Mixed,
    default: {}
  },
  evaluatorOutputs: {
    type: [Schema.Types.Mixed],
    default: []
  },
  finishTime: Date,
  errorMessage: String,
  status: {
    type: String,
    enum: EvaluationStatusValues,
    default: EvaluationStatusEnum.queuing
  }
});

/**
 * Evaluation item indexes for performance
 */
EvaluationItemSchema.index({ evalId: 1 }); // Basic queries
EvaluationItemSchema.index({ evalId: 1, createTime: -1 }); // Time-sorted listing

// Status filtering indexes
EvaluationItemSchema.index({ evalId: 1, status: 1, createTime: -1 }); // Status with time
EvaluationItemSchema.index({ evalId: 1, status: 1 }); // Status only

// Text search index for content filtering
EvaluationItemSchema.index({
  'dataItem.userInput': 'text',
  'dataItem.expectedOutput': 'text',
  'targetOutput.actualOutput': 'text'
}); // Text search across inputs and outputs

export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationTaskSchema
);

export const MongoEvalItem = getMongoModel<EvaluationItemSchemaType>(
  EvalItemCollectionName,
  EvaluationItemSchema
);
