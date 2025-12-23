import type {
  RerankTrainsetStatusEnum,
  TrainDataSourceEnum,
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from './constants';

/** Trainset statistics (dynamically calculated, not stored in DB) */
export interface TrainsetStatistics {
  dataCount: number;
  positiveCount: number;
  negativeCount: number;
  sourceSummary: Array<
    | {
        type: 'dataset';
        count: number;
        datasetInfo: {
          datasetId: string;
        };
      }
    | {
        type: 'chat_log';
        count: number;
        chatLogInfo: {
          chatId: string;
        };
      }
    | {
        type: 'manual';
        count: number;
        manualInfo: {
          creator: string;
        };
      }
  >;
}

/** Rerank trainset schema */
export type RerankTrainsetSchemaType = {
  _id: string;
  appId: string;
  teamId: string;
  tmbId: string;

  name: string;
  description?: string;

  status: `${RerankTrainsetStatusEnum}`;
  errorMsg?: string;

  createTime: Date;
  updateTime: Date;

  statistics?: TrainsetStatistics;
};

/** Rerank training data schema */
export type RerankTrainsetDataSchemaType = {
  _id: string;
  trainsetId: string;
  appId: string;
  teamId: string;

  query: string;
  positiveDocs: string[];
  negativeDocs: string[];

  source: `${TrainDataSourceEnum}`;

  metadata: {
    sourceInfo: {
      datasetInfo?: {
        dataId: string;
        datasetId: string;
      };

      chatLogInfo?: {
        chatId: string;
        itemIds: string[];
      };

      manualInfo?: {
        creator: string;
        createdAt: Date;
        reason?: string;
      };
    };

    generateConfig?: {
      sampleSize?: number;
      forceRegenerate?: boolean;
      minNegativeSamples?: number;
      maxNegativeSamples?: number;
      includeOriginalQ?: boolean;
    };
  };

  createTime: Date;
};

/** Rerank training task schema */
export type RerankTrainTaskSchemaType = {
  _id: string;
  appId: string;
  trainsetId: string;
  teamId: string;
  tmbId: string;

  name: string;
  baseModelConfigId: string;
  baseModelEndpoint: {
    base_url?: string;
    api_key?: string;
    model: string;
  };

  status: RerankTrainTaskStatusEnum;

  checkpoint: {
    stage: `${RerankTaskCheckpointStageEnum}` | null;
    data?: {
      preparing?: {
        trainDatasetId: string;
        trainDatasetFilePath: string;
      };

      finetuning?: {
        aicpTaskId: string;
        tunedModelEndpoint: {
          base_url: string;
          api_key: string;
          model: string;
        };
      };

      registering?: {
        tunedModelConfigId: string;
      };

      evaluating?: {
        evalDatasetId?: string;
        baseModelEvalResult?: Record<string, any>;
        tunedModelEvalResult?: Record<string, any>;
      };

      applying?: {
        versionId?: string;
        versionName?: string;
        previousModelConfigId?: string;
        updatedNodesCount?: number;
      };
    };
    stageEndTime?: {
      preparing?: Date;
      finetuning?: Date;
      registering?: Date;
      evaluating?: Date;
      applying?: Date;
    };
  };

  result?: {
    trainDatasetId: string;
    trainDatasetFilePath: string;
    tunedModelConfigId: string;
    evalDatasetId: string;
    baseModelEvalResult: Record<string, any>;
    tunedModelEvalResult: Record<string, any>;
    versionId: string;
    versionName: string;
    previousModelConfigId: string;
    updatedNodesCount: number;
  };

  errorMsg?: string;

  jobId?: string;

  createTime: Date;
  updateTime: Date;
  finishTime?: Date;
};
