import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import {
  DatasetDataIndexTypeEnum,
  DatasetDataIndexTypeMap
} from '@fastgpt/global/core/dataset/constant';

export const DatasetDataCollectionName = 'dataset.datas';

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
        type: {
          type: String,
          enum: Object.keys(DatasetDataIndexTypeMap),
          default: DatasetDataIndexTypeEnum.custom
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
  }
});

try {
  DatasetDataSchema.index({ teamId: 1 });
  DatasetDataSchema.index({ datasetId: 1 });
  DatasetDataSchema.index({ collectionId: 1 });
  DatasetDataSchema.index({ updateTime: -1 });
  DatasetDataSchema.index({ collectionId: 1, q: 1, a: 1 });
  // full text index
  DatasetDataSchema.index({ datasetId: 1, fullTextToken: 'text' });
} catch (error) {
  console.log(error);
}

export const MongoDatasetData: Model<DatasetDataSchemaType> =
  models[DatasetDataCollectionName] || model(DatasetDataCollectionName, DatasetDataSchema);
MongoDatasetData.syncIndexes();
