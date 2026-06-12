import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';
const { Schema } = connectionMongo;
import { type DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constants';
import { ChunkSettings, DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { PermissionEffectScopeEnum } from '@fastgpt/global/support/permission/constant';

export const DatasetColCollectionName = 'dataset_collections';

// Column Schema for database tables
const ColumnSchema = new Schema(
  {
    columnName: { type: String, required: true },
    columnType: { type: String, default: 'TEXT' },
    description: { type: String, default: '' },
    examples: { type: [String], default: [] },
    forbid: { type: Boolean, default: false },
    valueIndex: { type: Boolean, default: true },

    // Database attributes
    isNullable: { type: Boolean, default: true },
    defaultValue: { type: String, default: null },
    isAutoIncrement: { type: Boolean, default: false },
    isPrimaryKey: { type: Boolean, default: false },
    isForeignKey: { type: Boolean, default: false },
    relatedColumns: { type: [String], default: [] },

    // Extended metadata
    metadata: { type: Object, default: {} }
  },
  { _id: false }
);

// Constraint Schema
const ConstraintSchema = new Schema(
  {
    name: { type: String, required: true },
    column: { type: String, default: '' }
  },
  { _id: false }
);

// Foreign Key Schema
const ForeignKeySchema = new Schema(
  {
    referredSchema: { type: String },
    referredTable: { type: String, required: true },
    referredColumns: { type: String, required: true }
  },
  { _id: false }
).add(ConstraintSchema);

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
    type: [],
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
  parsingCompleteTime: {
    type: Date
  },
  parseStartTime: {
    type: Date
  },
  indexingStartTime: {
    type: Date
  },
  indexingCompleteTime: {
    type: Date
  },
  tableSchema: {
    type: {
      tableName: { type: String, required: true },
      description: { type: String, default: '' },
      exist: { type: Boolean, default: true },
      columns: {
        type: Schema.Types.Mixed,
        default: {}
      },
      foreignKeys: { type: [ForeignKeySchema], default: [] },
      primaryKeys: { type: [String], default: [] },
      constraints: { type: [ConstraintSchema], default: [] },
      lastUpdated: { type: Date, default: Date.now }
    }
  },
  // Metadata
  // local file collection
  // Support both GridFS ObjectId (string) and S3 key (string)
  fileId: String,
  // web link collection
  rawLink: String,
  // Api collection
  apiFileId: String,
  // external collection(Abandoned)
  externalFileId: String,
  externalFileUrl: String, // external import url

  rawTextLength: Number,
  hashRawText: String,
  fileMd5: String,

  metadata: {
    type: Object,
    default: {}
  },

  forbid: Boolean,

  // Permission
  inheritPermission: {
    type: Boolean,
    default: true
  },
  permissionEffectScope: {
    type: String,
    enum: Object.values(PermissionEffectScopeEnum),
    default: PermissionEffectScopeEnum.allChildren
  },

  // Soft delete
  deleteTime: {
    type: Date,
    default: null
  },

  // Precomputed statistics for listV2 performance
  // Updated asynchronously by the collectionUpdate worker
  dataAmount: {
    type: Number,
    default: 0
  },
  trainingAmount: {
    type: Number,
    default: 0
  },
  processedCount: {
    type: Number,
    default: 0
  },
  remainingCount: {
    type: Number,
    default: 0
  },
  hasError: {
    type: Boolean,
    default: false
  },
  allParse: {
    type: Boolean,
    default: false
  },
  statsUpdatedAt: {
    type: Date
  },

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

// 创建和保存时自动更新 updateTime
DatasetCollectionSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

// update 操作时自动更新 updateTime
// 注意：在 query middleware 中，this 指向 Query 对象，不是 Document 对象
DatasetCollectionSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  // 使用 Query 的 set 方法来设置 updateTime
  this.set({ updateTime: new Date() });
  next();
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

  // Tag filter (旧格式: tags 为 ObjectId 数组)
  DatasetCollectionSchema.index({ teamId: 1, datasetId: 1, tags: 1 });
  // Tag filter (新格式: tags 为 { tagId, value } 对象数组，按 tagId 过滤走此索引)
  DatasetCollectionSchema.index({ 'tags.tagId': 1 });
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

  // MD5 duplicate check
  DatasetCollectionSchema.index({ teamId: 1, datasetId: 1, fileMd5: 1 });

  // Clear invalid image
  DatasetCollectionSchema.index({
    teamId: 1,
    'metadata.relatedImgId': 1
  });

  // Soft delete cleanup
  DatasetCollectionSchema.index({ deleteTime: 1 });

  // Backfill: find non-folder collections without stats
  // Partial index: once statsUpdatedAt is set, the document drops out of the index
  DatasetCollectionSchema.index(
    { deleteTime: 1, type: 1, statsUpdatedAt: 1 },
    {
      partialFilterExpression: {
        deleteTime: { $eq: null },
        statsUpdatedAt: { $exists: false }
      }
    }
  );
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build dataset collection indexes', { error });
}

export const MongoDatasetCollection = getMongoModel<DatasetCollectionSchemaType>(
  DatasetColCollectionName,
  DatasetCollectionSchema
);
