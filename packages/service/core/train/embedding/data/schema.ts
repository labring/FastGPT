import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { EmbeddingTrainsetDataSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { TrainDataSourceEnum } from '@fastgpt/global/core/train/embedding/constants';

/** Embedding trainset data schema */
const EmbeddingTrainsetDataSchema = new connectionMongo.Schema({
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'embedding_trainset',
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
EmbeddingTrainsetDataSchema.index({ trainsetId: 1 });
EmbeddingTrainsetDataSchema.index({ trainsetId: 1, createTime: -1 });
EmbeddingTrainsetDataSchema.index({ teamId: 1, createTime: -1 });
EmbeddingTrainsetDataSchema.index({ teamId: 1 });
EmbeddingTrainsetDataSchema.index({ source: 1 });
EmbeddingTrainsetDataSchema.index({ trainsetId: 1, source: 1, createTime: -1 });

export const MongoEmbeddingTrainsetData = getMongoModel<EmbeddingTrainsetDataSchemaType>(
  'embedding_trainset_data',
  EmbeddingTrainsetDataSchema
);
