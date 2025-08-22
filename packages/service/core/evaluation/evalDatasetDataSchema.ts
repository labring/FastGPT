import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/type';
import { connectionMongo, getMongoModel } from '../../common/mongo';
import { EvalDatasetCollectionName } from './evalDatasetCollectionSchema';

const { Schema } = connectionMongo;

export const EvalDatasetDataCollectionName = 'eval_dataset_data';

const EvalDatasetDataSchema = new Schema({
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: EvalDatasetCollectionName,
    required: true,
    index: true
  },
  user_input: {
    type: String,
    default: '',
    trim: true
  },
  actual_output: {
    type: String,
    default: '',
    trim: true
  },
  expected_output: {
    type: String,
    default: '',
    trim: true
  },
  context: {
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
  retrieval_context: {
    type: [
      {
        type: String,
        trim: true
      }
    ],
    default: []
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
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
EvalDatasetDataSchema.index({ datasetId: 1, createTime: -1 });
EvalDatasetDataSchema.index({ datasetId: 1, updateTime: -1 });

// Text search index for searching within inputs and outputs
EvalDatasetDataSchema.index({
  user_input: 'text',
  expected_output: 'text',
  actual_output: 'text'
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
