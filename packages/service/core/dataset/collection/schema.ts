import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { TrainingTypeMap, DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constants';
import { DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const DatasetColCollectionName = 'dataset_collections';

const DatasetCollectionSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    default: null
  },
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
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  type: {
    type: String,
    enum: Object.keys(DatasetCollectionTypeMap),
    required: true
  },
  name: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  forbid: {
    type: Boolean,
    default: false
  },

  // chunk filed
  trainingType: {
    type: String,
    enum: Object.keys(TrainingTypeMap)
  },
  chunkSize: {
    type: Number,
    required: true
  },
  chunkSplitter: {
    type: String
  },
  qaPrompt: {
    type: String
  },
  ocrParse: Boolean,

  tags: {
    type: [String],
    default: []
  },

  // local file collection
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'dataset.files'
  },
  // web link collection
  rawLink: String,
  // external collection
  externalFileId: String,

  // metadata
  rawTextLength: Number,
  hashRawText: String,
  externalFileUrl: String, // external import url
  metadata: {
    type: Object,
    default: {}
  }
});

try {
  // auth file
  DatasetCollectionSchema.index({ teamId: 1, fileId: 1 });

  // list collection; deep find collections
  DatasetCollectionSchema.index({
    teamId: 1,
    datasetId: 1,
    parentId: 1,
    updateTime: -1
  });

  // Tag filter
  DatasetCollectionSchema.index({ teamId: 1, datasetId: 1, tags: 1 });
  // create time filter
  DatasetCollectionSchema.index({ teamId: 1, datasetId: 1, createTime: 1 });

  // Get collection by external file id
  DatasetCollectionSchema.index(
    { datasetId: 1, externalFileId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        externalFileId: { $exists: true }
      }
    }
  );
} catch (error) {
  console.log(error);
}

export const MongoDatasetCollection = getMongoModel<DatasetCollectionSchemaType>(
  DatasetColCollectionName,
  DatasetCollectionSchema
);
