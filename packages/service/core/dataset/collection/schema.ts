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

// Column Schema for database tables
const ColumnSchema = new Schema({
  columnName: { type: String, required: true },
  columnType: { type: String, default: 'TEXT' },
  description: { type: String, default: '' },
  examples: { type: [String], default: [] },
  forbid: { type: Boolean, default: false },
  valueIndex: { type: Boolean, default: true },
  
  // Database attributes
  isPrimaryKey: { type: Boolean, default: false },
  isForeignKey: { type: Boolean, default: false },
  relatedColumns: { type: [String], default: [] },
  
  // Extended metadata
  metadata: { type: Object, default: {} }
}, { _id: false });

// Foreign Key Schema
const ForeignKeySchema = new Schema({
  constrainedColumns: { type: [String], default: [] },
  referredSchema: { type: String, default: null },
  referredTable: { type: String, required: true },
  referredColumns: { type: [String], default: [] }
}, { _id: false });

// Index Schema
const IndexSchema = new Schema({
  name: { type: String, required: true },
  columns: { type: [String], default: [] },
  unique: { type: Boolean, default: false },
  type: { type: String, default: 'BTREE' }
}, { _id: false });

// Constraint Schema
const ConstraintSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // PRIMARY, FOREIGN, UNIQUE, CHECK
  columns: { type: [String], default: [] },
  definition: { type: String, default: '' }
}, { _id: false });

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
  tableSchema: { 
    type: {
      tableName: { type: String, required: true },
      description: { type: String, default: '' },
      columns: { 
        type: Map,
        of: ColumnSchema,
        default: {}
      },
      foreignKeys: { type: [ForeignKeySchema], default: [] },
      primaryKeys: { type: [String], default: [] },
      indexes: { type: [IndexSchema], default: [] },
      constraints: { type: [ConstraintSchema], default: [] },
      rowCount: Number,
      estimatedSize: String,
      lastUpdated: { type: Date, default: Date.now }
    }
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

  // Parse settings
  customPdfParse: Boolean,
  apiFileParentId: String,

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
