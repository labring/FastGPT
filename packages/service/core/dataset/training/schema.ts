/* 模型的知识库 */
import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { TrainingTypeMap } from '@fastgpt/global/core/dataset/constants';
import { DatasetColCollectionName } from '../collection/schema';
import { DatasetCollectionName } from '../schema';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

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
    ref: DatasetCollectionName,
    required: true
  },
  collectionId: {
    type: Schema.Types.ObjectId,
    ref: DatasetColCollectionName,
    required: true
  },
  billId: {
    // concat bill
    type: String
  },
  mode: {
    type: String,
    enum: Object.keys(TrainingTypeMap),
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

  model: {
    // ai model
    type: String,
    required: true
  },
  prompt: {
    // qa split prompt
    type: String,
    default: ''
  },
  q: {
    type: String,
    default: ''
  },
  a: {
    type: String,
    default: ''
  },
  chunkIndex: {
    type: Number,
    default: 0
  },
  weight: {
    type: Number,
    default: 0
  },
  dataId: {
    type: Schema.Types.ObjectId
  },
  indexes: {
    type: [
      {
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
