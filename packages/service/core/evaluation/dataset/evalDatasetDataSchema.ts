import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { EvalDatasetCollectionName } from './evalDatasetCollectionSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataCreateFromValues,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum,
  EvalDatasetDataQualityResultValues
} from '@fastgpt/global/core/evaluation/dataset/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

const { Schema } = connectionMongo;

export const EvalDatasetDataCollectionName = 'eval_dataset_datas';

const EvalDatasetDataSchema = new Schema({
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
  evalDatasetCollectionId: {
    type: Schema.Types.ObjectId,
    ref: EvalDatasetCollectionName,
    required: true,
    index: true
  },
  [EvalDatasetDataKeyEnum.UserInput]: {
    type: String,
    default: '',
    trim: true
  },
  [EvalDatasetDataKeyEnum.ActualOutput]: {
    type: String,
    default: '',
    trim: true
  },
  [EvalDatasetDataKeyEnum.ExpectedOutput]: {
    type: String,
    default: '',
    trim: true
  },
  [EvalDatasetDataKeyEnum.Context]: {
    type: [
      {
        type: String,
        trim: true
      }
    ],
    default: [],
    validate: {
      validator: (arr: string[]) => arr.length <= 100,
      message: 'Context array cannot exceed 100 items'
    }
  },
  [EvalDatasetDataKeyEnum.RetrievalContext]: {
    type: [
      {
        type: String,
        trim: true
      }
    ],
    default: []
  },
  qualityMetadata: {
    status: {
      type: String,
      enum: Object.values(EvalDatasetDataQualityStatusEnum),
      default: EvalDatasetDataQualityStatusEnum.unevaluated,
      required: true
    },
    score: {
      type: Number,
      min: 0,
      max: 1
    },
    reason: String,
    model: String,
    usages: [Schema.Types.Mixed],
    runLogs: [Schema.Types.Mixed],
    startTime: Date,
    finishTime: Date,
    queueTime: Date,
    error: String
  },
  synthesisMetadata: {
    sourceDataId: String,
    sourceDatasetId: String,
    sourceCollectionId: String,
    intelligentGenerationModel: String,
    synthesizedAt: Date,
    generatedAt: Date
  },
  qualityResult: {
    type: String,
    enum: EvalDatasetDataQualityResultValues
  },
  createFrom: {
    type: String,
    enum: EvalDatasetDataCreateFromValues,
    default: EvalDatasetDataCreateFromEnum.manual,
    required: true,
    index: true
  },
  createTime: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updateTime: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient queries
EvalDatasetDataSchema.index({ evalDatasetCollectionId: 1, createTime: -1 });
EvalDatasetDataSchema.index({ evalDatasetCollectionId: 1, updateTime: -1 });

// Quality related indexes
EvalDatasetDataSchema.index({ 'qualityMetadata.status': 1 });
EvalDatasetDataSchema.index({ qualityResult: 1 });
EvalDatasetDataSchema.index({ evalDatasetCollectionId: 1, qualityResult: 1 });

// Text search index for searching within inputs and outputs
EvalDatasetDataSchema.index({
  [EvalDatasetDataKeyEnum.UserInput]: 'text',
  [EvalDatasetDataKeyEnum.ExpectedOutput]: 'text',
  [EvalDatasetDataKeyEnum.ActualOutput]: 'text'
});

// Update the updateTime on save
EvalDatasetDataSchema.pre('save', function () {
  if (this.isModified() && !this.isNew) {
    this.updateTime = new Date();
  }
});

export const MongoEvalDatasetData = getMongoModel<EvalDatasetDataSchemaType>(
  EvalDatasetDataCollectionName,
  EvalDatasetDataSchema
);
