/* 模型的知识库 */
import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

export const DatasetTrainingCollectionName = 'dataset_trainings';

const TrainingDataSchema = new Schema({
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
    required: true
  },
  collectionId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    required: true
  },
  billId: String,
  mode: {
    type: String,
    enum: Object.values(TrainingModeEnum),
    required: true
  },

  expireAt: {
    // It will be deleted after 7 days
    type: Date,
    default: () => new Date()
  },
  lockTime: {
    type: Date,
    default: () => new Date('2000/1/1')
  },
  retryCount: {
    type: Number,
    default: 5
  },

  model: String,
  prompt: String,
  q: {
    type: String,
    default: ''
  },
  a: {
    type: String,
    default: ''
  },
  imageId: String,
  chunkIndex: {
    type: Number,
    default: 0
  },
  indexSize: Number,
  weight: {
    type: Number,
    default: 0
  },
  dataId: Schema.Types.ObjectId,
  indexes: {
    type: [
      {
        type: {
          type: String,
          enum: Object.values(DatasetDataIndexTypeEnum)
        },
        text: {
          type: String,
          required: true
        }
      }
    ],
    default: []
  },

  errorMsg: String
});

TrainingDataSchema.virtual('dataset', {
  ref: DatasetCollectionName,
  localField: 'datasetId',
  foreignField: '_id',
  justOne: true
});
TrainingDataSchema.virtual('collection', {
  ref: DatasetColCollectionName,
  localField: 'collectionId',
  foreignField: '_id',
  justOne: true
});

try {
  // lock training data(teamId); delete training data
  TrainingDataSchema.index({ teamId: 1, datasetId: 1 });
  // get training data and sort
  TrainingDataSchema.index({ mode: 1, retryCount: 1, lockTime: 1, weight: -1 });
  TrainingDataSchema.index({ expireAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // 7 days
} catch (error) {
  console.log(error);
}

export const MongoDatasetTraining = getMongoModel<DatasetTrainingSchemaType>(
  DatasetTrainingCollectionName,
  TrainingDataSchema
);
