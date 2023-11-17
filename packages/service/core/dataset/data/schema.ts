import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetCollectionName } from '../schema';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetDataIndexTypeMap } from '@fastgpt/global/core/dataset/constant';

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
          required: true
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
  }
});

try {
  DatasetDataSchema.index({ userId: 1 });
  DatasetDataSchema.index({ datasetId: 1 });
  DatasetDataSchema.index({ collectionId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDatasetData: Model<DatasetDataSchemaType> =
  models[DatasetDataCollectionName] || model(DatasetDataCollectionName, DatasetDataSchema);
MongoDatasetData.syncIndexes();
