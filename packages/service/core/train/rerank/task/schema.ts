import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import {
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from '@fastgpt/global/core/train/rerank/constants';

/** Rerank training task schema */
const RerankTrainTaskSchema = new connectionMongo.Schema({
  appId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'app',
    required: true
  },
  trainsetId: {
    type: connectionMongo.Schema.Types.ObjectId,
    ref: 'rerank_trainset',
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
  baseModelConfigId: {
    type: String,
    required: true
  },
  baseModelEndpoint: {
    type: {
      base_url: {
        type: String,
        required: false
      },
      model: {
        type: String,
        required: true
      },
      api_key: {
        type: String,
        required: false
      }
    },
    required: true
  },
  status: {
    type: String,
    enum: Object.values(RerankTrainTaskStatusEnum),
    default: RerankTrainTaskStatusEnum.pending
  },
  checkpoint: {
    type: {
      stage: {
        type: String,
        enum: [...Object.values(RerankTaskCheckpointStageEnum), null],
        default: null
      },
      data: {
        preparing: {
          trainDatasetId: String,
          trainDatasetFilePath: String
        },
        finetuning: {
          sftTaskId: String,
          tunedModelEndpoint: {
            base_url: String,
            model: String,
            api_key: String
          }
        },
        registering: {
          tunedModelConfigId: String
        },
        evaluating: {
          evalDatasetId: String,
          baseModelEvalResult: connectionMongo.Schema.Types.Mixed,
          tunedModelEvalResult: connectionMongo.Schema.Types.Mixed
        },
        applying: {
          versionId: String,
          versionName: String,
          previousModelConfigId: String,
          previousTaskId: String,
          updatedNodesCount: Number
        }
      },
      stageEndTime: {
        preparing: Date,
        finetuning: Date,
        registering: Date,
        evaluating: Date,
        applying: Date
      }
    },
    default: {
      stage: null,
      data: {},
      stageEndTime: {}
    }
  },
  result: {
    type: {
      trainDatasetId: String,
      trainDatasetFilePath: String,
      tunedModelConfigId: String,
      evalDatasetId: String,
      baseModelEvalResult: connectionMongo.Schema.Types.Mixed,
      tunedModelEvalResult: connectionMongo.Schema.Types.Mixed,
      versionId: String,
      versionName: String,
      previousModelConfigId: String,
      previousTaskId: String,
      updatedNodesCount: Number
    }
  },
  errorMsg: {
    type: connectionMongo.Schema.Types.Mixed
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
  },
  finishTime: {
    type: Date
  }
});

// Indexes
RerankTrainTaskSchema.index({ appId: 1, createTime: -1 });
RerankTrainTaskSchema.index({ trainsetId: 1, createTime: -1 }); // Support querying tasks by trainset
RerankTrainTaskSchema.index({ teamId: 1, status: 1 });
RerankTrainTaskSchema.index({ status: 1, updateTime: 1 });
RerankTrainTaskSchema.index({ jobId: 1 });
RerankTrainTaskSchema.index({ 'checkpoint.stage': 1, status: 1 });
RerankTrainTaskSchema.index({ appId: 1, status: 1, createTime: -1 });
RerankTrainTaskSchema.index({ teamId: 1, status: 1, createTime: -1 });

export const MongoRerankTrainTask = getMongoModel<RerankTrainTaskSchemaType>(
  'rerank_train_task',
  RerankTrainTaskSchema
);
