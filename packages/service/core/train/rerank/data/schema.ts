import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainsetDataSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/rerank/constants';

/** Rerank trainset data schema */
const RerankTrainsetDataSchema = new connectionMongo.Schema({
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'rerank_trainset',
    required: true
  },
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
  query: {
    type: String,
    required: true
  },
  positiveDocs: {
    type: [String],
    required: true
  },
  negativeDocs: {
    type: [String],
    required: true
  },
  source: {
    type: String,
    enum: Object.values(TrainDataSourceEnum),
    required: true
  },
  metadata: {
    type: {
      sourceInfo: {
        datasetInfo: {
          dataId: String,
          datasetId: String
        },
        chatLogInfo: {
          chatId: String,
          itemIds: [String]
        },
        manualInfo: {
          creator: String,
          createdAt: Date,
          reason: String
        }
      },
      generateConfig: {
        sampleSize: Number,
        forceRegenerate: Boolean,
        minNegativeSamples: Number,
        maxNegativeSamples: Number,
        includeOriginalQ: Boolean
      }
    },
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

// Indexes
RerankTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ appId: 1, createTime: -1 });
RerankTrainsetDataSchema.index({ teamId: 1 });
RerankTrainsetDataSchema.index({ source: 1 });
RerankTrainsetDataSchema.index({ appId: 1, source: 1 });
RerankTrainsetDataSchema.index({ trainsetId: 1, source: 1, createTime: -1 });

export const MongoRerankTrainsetData = getMongoModel<RerankTrainsetDataSchemaType>(
  'rerank_trainset_data',
  RerankTrainsetDataSchema
);
