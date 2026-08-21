import {
  DatasetSynonymCollectionName,
  DatasetSynonymJobCollectionName,
  DatasetSynonymMappingCollectionName,
  DatasetSynonymOperationCollectionName
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymJobTypeEnum,
  DatasetSynonymMappingSourceEnum,
  DatasetSynonymOperationStatusEnum,
  DatasetSynonymSchemaVersion,
  type DatasetSynonymConfigType,
  type DatasetSynonymJobType,
  type DatasetSynonymMappingType,
  type DatasetSynonymOperationType
} from '@fastgpt/global/core/dataset/synonym';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
import { DatasetCollectionName } from '../schema';

const { Schema } = connectionMongo;

const DatasetSynonymConfigSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  fileName: String,
  size: Number,
  uploadTime: Date,
  uploaderId: Schema.Types.ObjectId,
  activeVersion: {
    type: Number,
    required: true,
    default: 0
  },
  latestVersion: {
    type: Number,
    required: true,
    default: 0
  },
  schemaVersion: {
    type: Number,
    required: true,
    default: DatasetSynonymSchemaVersion
  },
  pendingVersion: Number,
  pendingFileName: String,
  pendingSize: Number,
  pendingUploaderId: Schema.Types.ObjectId,
  pendingUploadTime: Date,
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

defineIndex(DatasetSynonymConfigSchema, {
  key: { teamId: 1, datasetId: 1 },
  options: { unique: true }
});
defineIndex(DatasetSynonymConfigSchema, {
  key: { teamId: 1, fileId: 1 },
  options: {
    unique: true,
    partialFilterExpression: { fileId: { $exists: true } }
  },
  deprecated: true
});
defineIndex(DatasetSynonymConfigSchema, {
  key: { teamId: 1, pendingFileId: 1 },
  options: {
    unique: true,
    partialFilterExpression: { pendingFileId: { $exists: true } }
  },
  deprecated: true
});

const DatasetSynonymMappingSchema = new Schema({
  logicalMappingId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  synonymFileId: {
    type: Schema.Types.ObjectId,
    ref: DatasetSynonymCollectionName,
    required: true
  },
  fileVersion: {
    type: Number,
    required: true
  },
  standardizedTerm: {
    type: String,
    required: true
  },
  normalizedStandardizedTerm: {
    type: String,
    required: true
  },
  synonymTerms: {
    type: [String],
    required: true
  },
  normalizedSynonymTerms: {
    type: [String],
    required: true
  },
  allTerms: {
    type: String,
    required: true
  },
  fingerprint: {
    type: String,
    required: true
  },
  jobId: {
    type: Schema.Types.ObjectId,
    ref: DatasetSynonymJobCollectionName
  },
  source: {
    type: String,
    enum: Object.values(DatasetSynonymMappingSourceEnum),
    default: DatasetSynonymMappingSourceEnum.job,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1, normalizedStandardizedTerm: 1 },
  options: {
    name: 'synonym_version_standard_unique_v2',
    unique: true,
    partialFilterExpression: {
      fileVersion: { $type: 'number' },
      normalizedStandardizedTerm: { $type: 'string' }
    }
  }
});
defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1, normalizedStandardizedTerm: 1 },
  options: { unique: true },
  deprecated: true
});
defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1, logicalMappingId: 1 },
  options: { unique: true },
  deprecated: true
});
defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1, logicalMappingId: 1 },
  options: {
    name: 'synonym_version_logical_unique_v2',
    unique: true,
    partialFilterExpression: {
      fileVersion: { $type: 'number' },
      logicalMappingId: { $type: 'objectId' }
    }
  }
});
defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1 }
});
defineIndex(DatasetSynonymMappingSchema, { key: { teamId: 1, synonymFileId: 1 } });
defineIndex(DatasetSynonymMappingSchema, { key: { jobId: 1 } });

const DatasetSynonymJobSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    required: true
  },
  billId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  synonymFileId: {
    type: Schema.Types.ObjectId,
    ref: DatasetSynonymCollectionName
  },
  fileName: String,
  size: Number,
  uploadTime: Date,
  fileVersion: {
    type: Number,
    required: true
  },
  snapshotReady: Boolean,
  fencingToken: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(DatasetSynonymJobTypeEnum),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(DatasetSynonymJobStatusEnum),
    required: true
  },
  isActive: Boolean,
  diffSummary: {
    added: Number,
    removed: Number,
    changed: Number,
    unchanged: Number,
    affectedDataCount: Number,
    completedDataCount: Number,
    failedDataCount: Number,
    scannedDataCount: Number
  },
  affectedLogicalMappingIds: [Schema.Types.ObjectId],
  markingCursor: Schema.Types.ObjectId,
  errorMsg: String,
  cleanupPending: Boolean,
  retiredVersion: Number,
  cleanupError: String,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  finishTime: Date
});

const DatasetSynonymOperationSchema = new Schema({
  operationId: { type: String, required: true },
  teamId: { type: Schema.Types.ObjectId, ref: TeamCollectionName, required: true },
  datasetId: { type: Schema.Types.ObjectId, ref: DatasetCollectionName, required: true },
  jobId: { type: Schema.Types.ObjectId, ref: DatasetSynonymJobCollectionName, required: true },
  trainingId: { type: Schema.Types.ObjectId, required: true },
  dataId: { type: Schema.Types.ObjectId, required: true },
  targetVersion: { type: Number, required: true },
  status: {
    type: String,
    enum: Object.values(DatasetSynonymOperationStatusEnum),
    required: true
  },
  inputTokens: { type: Number, default: 0 },
  attempt: { type: Number, default: 1 },
  insertedVectorIds: { type: [String], default: [] },
  obsoleteVectorIds: { type: [String], default: [] },
  errorMsg: String,
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

defineIndex(DatasetSynonymOperationSchema, { key: { operationId: 1 }, options: { unique: true } });
defineIndex(DatasetSynonymOperationSchema, { key: { jobId: 1, status: 1 } });

defineIndex(DatasetSynonymJobSchema, {
  key: { teamId: 1, datasetId: 1, status: 1 }
});
defineIndex(DatasetSynonymJobSchema, {
  key: { teamId: 1, datasetId: 1 },
  options: {
    unique: true,
    partialFilterExpression: { isActive: true }
  }
});
defineIndex(DatasetSynonymJobSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: -1 },
  options: { unique: true }
});
defineIndex(DatasetSynonymJobSchema, { key: { updateTime: -1 } });
defineIndex(DatasetSynonymJobSchema, {
  key: { cleanupPending: 1, updateTime: 1 },
  options: { partialFilterExpression: { cleanupPending: true } }
});

export const MongoDatasetSynonym = getMongoModel<DatasetSynonymConfigType>(
  DatasetSynonymCollectionName,
  DatasetSynonymConfigSchema
);
export const MongoDatasetSynonymMapping = getMongoModel<DatasetSynonymMappingType>(
  DatasetSynonymMappingCollectionName,
  DatasetSynonymMappingSchema
);
export const MongoDatasetSynonymJob = getMongoModel<DatasetSynonymJobType>(
  DatasetSynonymJobCollectionName,
  DatasetSynonymJobSchema
);
export const MongoDatasetSynonymOperation = getMongoModel<DatasetSynonymOperationType>(
  DatasetSynonymOperationCollectionName,
  DatasetSynonymOperationSchema
);
