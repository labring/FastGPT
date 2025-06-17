import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constants';
import { ChunkSettings, DatasetCollectionName } from '../schema';
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

  // Basic info
  type: {
    type: String,
    enum: Object.keys(DatasetCollectionTypeMap),
    required: true
  },
  name: {
    type: String,
    required: true
  },
  tags: {
    type: [String],
    default: []
  },

  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },

  // Metadata
  // local file collection
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'dataset.files'
  },
  // web link collection
  rawLink: String,
  // Api collection
  apiFileId: String,
  // external collection(Abandoned)
  externalFileId: String,
  externalFileUrl: String, // external import url

  rawTextLength: Number,
  hashRawText: String,
  metadata: {
    type: Object,
    default: {}
  },

  forbid: Boolean,
  // next sync time
  nextSyncTime: Date,

  // Parse settings
  customPdfParse: Boolean,

  // Chunk settings
  ...ChunkSettings
});

DatasetCollectionSchema.virtual('dataset', {
  ref: DatasetCollectionName,
  localField: 'datasetId',
  foreignField: '_id',
  justOne: true
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

  // next sync time filter
  DatasetCollectionSchema.index(
    { type: 1, nextSyncTime: -1 },
    {
      partialFilterExpression: {
        nextSyncTime: { $exists: true }
      }
    }
  );

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

  // Clear invalid image
  DatasetCollectionSchema.index({
    teamId: 1,
    'metadata.relatedImgId': 1
  });
} catch (error) {
  console.log(error);
}

export const MongoDatasetCollection = getMongoModel<DatasetCollectionSchemaType>(
  DatasetColCollectionName,
  DatasetCollectionSchema
);
