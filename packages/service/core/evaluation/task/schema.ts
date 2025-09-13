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
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
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

// Optimized indexes for EvaluationTaskSchema
EvaluationTaskSchema.index({ teamId: 1, createTime: -1 }); // Main query: team filtering + time sorting
EvaluationTaskSchema.index({ teamId: 1, status: 1, createTime: -1 }); // Status filtering + time sorting
EvaluationTaskSchema.index({ teamId: 1, name: 1 }); // Name uniqueness check
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
  evaluator: EvaluationEvaluatorSchema, // Single evaluator configuration
  // Execution results
  targetOutput: {
    type: Schema.Types.Mixed,
    default: {}
  },
  evaluatorOutput: {
    type: Schema.Types.Mixed,
    default: {}
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
