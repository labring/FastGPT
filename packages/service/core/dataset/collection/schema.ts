import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetCollectionTypeMap } from '@fastgpt/global/core/dataset/constant';
import { DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const DatasetColCollectionName = 'dataset.collections';

const DatasetCollectionSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    default: null
  },
  userId: {
    // abandoned
    type: Schema.Types.ObjectId,
    ref: 'user'
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
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.keys(DatasetCollectionTypeMap),
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  metadata: {
    type: {
      fileId: {
        type: Schema.Types.ObjectId,
        ref: 'dataset.files'
      },
      rawLink: {
        type: String
      },
      // 451 初始化
      pgCollectionId: {
        type: String
      }
    },
    default: {}
  }
});

try {
  DatasetCollectionSchema.index({ datasetId: 1 });
  DatasetCollectionSchema.index({ datasetId: 1, parentId: 1 });
  DatasetCollectionSchema.index({ updateTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoDatasetCollection: Model<DatasetCollectionSchemaType> =
  models[DatasetColCollectionName] || model(DatasetColCollectionName, DatasetCollectionSchema);
