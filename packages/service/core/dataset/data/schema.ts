import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';

export const DatasetDataCollectionName = 'dataset_datas';

const DatasetDataSchema = new Schema({
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
  collectionId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    required: true
  },
  q: {
    type: String,
    required: true
  },
  a: {
    type: String,
    default: ''
  },
  fullTextToken: {
    type: String,
    default: ''
  },
  indexes: {
    type: [
      {
        defaultIndex: {
          type: Boolean,
          default: false
        },
        dataId: {
          type: String,
          required: true
        },
        text: {
          type: String,
          required: true
        }
      }
    ],
    default: []
  },

  updateTime: {
    type: Date,
    default: () => new Date()
  },
  chunkIndex: {
    type: Number,
    default: 0
  },
  inited: {
    type: Boolean
  },
  rebuilding: Boolean
});

// list collection and count data; list data; delete collection(relate data)
DatasetDataSchema.index({
  teamId: 1,
  datasetId: 1,
  collectionId: 1,
  chunkIndex: 1,
  updateTime: -1
});
// full text index
DatasetDataSchema.index({ teamId: 1, datasetId: 1, fullTextToken: 'text' });
// Recall vectors after data matching
DatasetDataSchema.index({ teamId: 1, datasetId: 1, collectionId: 1, 'indexes.dataId': 1 });
DatasetDataSchema.index({ updateTime: 1 });
// rebuild data
DatasetDataSchema.index({ rebuilding: 1, teamId: 1, datasetId: 1 });

export const MongoDatasetData = getMongoModel<DatasetDataSchemaType>(
  DatasetDataCollectionName,
  DatasetDataSchema
);
