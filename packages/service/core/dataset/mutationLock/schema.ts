import { DatasetMutationLockCollectionName } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetMutationLockOwnerTypeEnum,
  type DatasetMutationLockType
} from '@fastgpt/global/core/dataset/synonym';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
import { DatasetCollectionName } from '../schema';

const { Schema } = connectionMongo;

const DatasetMutationLockSchema = new Schema({
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
  ownerId: String,
  ownerType: {
    type: String,
    enum: Object.values(DatasetMutationLockOwnerTypeEnum)
  },
  sharedOwners: {
    type: [
      {
        _id: false,
        ownerId: { type: String, required: true },
        leaseUntil: { type: Date, required: true }
      }
    ],
    default: []
  },
  fencingToken: {
    type: Number,
    required: true
  },
  leaseUntil: {
    type: Date,
    required: true,
    default: () => new Date(0)
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

defineIndex(DatasetMutationLockSchema, {
  key: { teamId: 1, datasetId: 1 },
  options: { unique: true }
});

export const MongoDatasetMutationLock = getMongoModel<DatasetMutationLockType>(
  DatasetMutationLockCollectionName,
  DatasetMutationLockSchema
);
