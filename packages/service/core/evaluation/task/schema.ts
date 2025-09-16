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
      default: 80
    },
    scoreScaling: {
      type: Number,
      required: false,
      default: 100, // Default 100x amplification
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
  },
  // Summary configuration for each evaluator (indexed by evaluator index)
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
      calculateType: {
        type: Number,
        enum: CaculateMethodValues,
        required: true
      },
      summary: {
        type: String,
        default: ''
      },
      summaryStatus: {
        type: Number,
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
});

// Optimized indexes for EvaluationTaskSchema
EvaluationTaskSchema.index({ teamId: 1, createTime: -1 }); // Main query: team filtering + time sorting
EvaluationTaskSchema.index({ teamId: 1, status: 1, createTime: -1 }); // Status filtering + time sorting
EvaluationTaskSchema.index({ teamId: 1, name: 1 }, { unique: true }); // Name uniqueness check
EvaluationTaskSchema.index({ tmbId: 1, createTime: -1 }); // Query by creator
EvaluationTaskSchema.index({ status: 1 }); // Status-based queue processing

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
  evaluators: [EvaluationEvaluatorSchema], // Multiple evaluator configurations
  // Execution results
  targetOutput: {
    type: Schema.Types.Mixed,
    default: {}
  },
  evaluatorOutputs: {
    type: [Schema.Types.Mixed],
    default: []
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

// Optimized indexes for EvaluationItemSchema
EvaluationItemSchema.index({ evalId: 1, createTime: -1 }); // Main query: eval filtering + time sorting
EvaluationItemSchema.index({ evalId: 1, status: 1, createTime: -1 }); // Status filtering + time sorting
EvaluationItemSchema.index({ status: 1, retry: 1 }); // Queue processing with retry logic
EvaluationItemSchema.index({ evalId: 1, 'dataItem._id': 1 }); // DataItem aggregation queries
EvaluationItemSchema.index({ evalId: 1, status: 1, retry: 1 }); // Retry operations optimization

// Optimized text search for content filtering (removed evalId for flexibility)
EvaluationItemSchema.index({
  'dataItem.userInput': 'text',
  'dataItem.expectedOutput': 'text',
  'targetOutput.actualOutput': 'text'
}); // Comprehensive text search across all content fields

export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationTaskSchema
);

export const MongoEvalItem = getMongoModel<EvaluationItemSchemaType>(
  EvalItemCollectionName,
  EvaluationItemSchema
);
