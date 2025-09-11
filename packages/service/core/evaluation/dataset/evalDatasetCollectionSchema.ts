import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvalDatasetCollectionSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';

const { Schema } = connectionMongo;

export const EvalDatasetCollectionName = 'eval_dataset_collections';

const EvalDatasetCollectionSchema = new Schema({
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
  createTime: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updateTime: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  evaluationModel: {
    type: String,
    trim: true,
    maxlength: 100
  }
});

// Indexes for efficient queries
EvalDatasetCollectionSchema.index({ teamId: 1, createTime: -1 });
EvalDatasetCollectionSchema.index({ teamId: 1, name: 1 }, { unique: true });
EvalDatasetCollectionSchema.index({ teamId: 1, updateTime: -1 });

// Update the updateTime on save
EvalDatasetCollectionSchema.pre('save', function () {
  if (this.isModified() && !this.isNew) {
    this.updateTime = new Date();
  }
});

export const MongoEvalDatasetCollection = getMongoModel<EvalDatasetCollectionSchemaType>(
  EvalDatasetCollectionName,
  EvalDatasetCollectionSchema
);
