import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';

const RerankTrainsetSchema = new connectionMongo.Schema({
  appId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'app',
    required: true
  },
  teamId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team',
    required: true
  },
  tmbId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'team_member',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: Object.values(RerankTrainsetStatusEnum),
    default: RerankTrainsetStatusEnum.pending
  },
  errorMsg: {
    type: String
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

// Indexes
RerankTrainsetSchema.index({ appId: 1, createTime: -1 }); // Support querying all trainsets for an app, sorted by creation time
RerankTrainsetSchema.index({ teamId: 1, updateTime: -1 });
RerankTrainsetSchema.index({ status: 1 });

export const MongoRerankTrainset = getMongoModel<RerankTrainsetSchemaType>(
  'rerank_trainset',
  RerankTrainsetSchema
);
