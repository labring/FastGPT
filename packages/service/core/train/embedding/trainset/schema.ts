import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { EmbeddingTrainsetSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTrainsetStatusEnum } from '@fastgpt/global/core/train/embedding/constants';

const EmbeddingTrainsetSchema = new connectionMongo.Schema({
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
    enum: Object.values(EmbeddingTrainsetStatusEnum),
    default: EmbeddingTrainsetStatusEnum.pending
  },
  errorMsg: {
    type: connectionMongo.Schema.Types.Mixed // Support both string (legacy) and EnhancedErrorMessage object
  },
  jobId: {
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
EmbeddingTrainsetSchema.index({ teamId: 1, updateTime: -1 });
EmbeddingTrainsetSchema.index({ status: 1 });
EmbeddingTrainsetSchema.index({ jobId: 1 });

export const MongoEmbeddingTrainset = getMongoModel<EmbeddingTrainsetSchemaType>(
  'embedding_trainset',
  EmbeddingTrainsetSchema
);
