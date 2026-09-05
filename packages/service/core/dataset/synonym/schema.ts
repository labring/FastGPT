import {
  DatasetSynonymCollectionName,
  DatasetSynonymMappingCollectionName
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetSynonymSchemaVersion,
  type DatasetSynonymConfigType,
  type DatasetSynonymMappingType
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
  version: {
    type: Number,
    required: true,
    default: 1
  },
  enabled: { type: Boolean, required: true, default: true },
  schemaVersion: {
    type: Number,
    required: true,
    default: DatasetSynonymSchemaVersion
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

defineIndex(DatasetSynonymConfigSchema, {
  key: { teamId: 1, datasetId: 1 },
  options: { unique: true }
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
  options: { unique: true }
});
defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1, logicalMappingId: 1 },
  options: { unique: true }
});
defineIndex(DatasetSynonymMappingSchema, {
  key: { teamId: 1, datasetId: 1, fileVersion: 1 }
});
defineIndex(DatasetSynonymMappingSchema, { key: { teamId: 1, synonymFileId: 1 } });

export const MongoDatasetSynonym = getMongoModel<DatasetSynonymConfigType>(
  DatasetSynonymCollectionName,
  DatasetSynonymConfigSchema
);
export const MongoDatasetSynonymMapping = getMongoModel<DatasetSynonymMappingType>(
  DatasetSynonymMappingCollectionName,
  DatasetSynonymMappingSchema
);
