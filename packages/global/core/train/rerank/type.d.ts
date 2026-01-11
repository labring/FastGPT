import type {
  RerankTrainsetStatusEnum,
  TrainDataSourceEnum,
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum
} from './constants';
import type { EnhancedErrorMessage } from './error';

/**
 * Detailed evaluation results from DiTing
 * Contains various ranking metrics at different k values
 */
export interface DiTingDetailedResults {
  rerank_top5_mrr?: number;
  rerank_top5_ndcg?: number;
  rerank_top5_map?: number;
  rerank_top5_precision?: number;
  rerank_top10_mrr?: number;
  rerank_top10_ndcg?: number;
  rerank_top10_map?: number;
  rerank_top10_precision?: number;
  rerank_top10_recall?: number;
  rerank_top15_mrr?: number;
  rerank_top15_ndcg?: number;
  rerank_top15_map?: number;
  rerank_top15_precision?: number;
  overall_mrr?: number;
  overall_ndcg?: number;
  overall_map?: number;
  overall_precision?: number;
  [key: string]: any;
}

/**
 * Rerank evaluation result
 * Contains the complete runLogs structure from DiTing evaluation response
 * This is what gets returned by evaluation stages and stored in checkpoint/result
 */
export interface RerankEvalResult {
  detailed_results: DiTingDetailedResults;
  mrr_scores?: Record<string, number[]>;
  ndcg_scores?: Record<string, number[]>;
  map_scores?: Record<string, number[]>;
  /**
   * Retrieval ranks for each case (case-by-case)
   * Outer array: each evaluation case
   * Inner array: ranks of each retrieved document (position in original retrieval list)
   * Example: [[1, 3, 2, 5, 4], [2, 1, 4, 3, 5]]
   *   - Case 1: expected doc was at position 1, 3, etc. in retrieval list
   *   - Case 2: expected doc was at position 2, 1, etc. in retrieval list
   */
  retrieval_ranks?: number[][];
  column_stats?: Record<string, any>;
  total_rows?: number;
  expect_count?: number;
}

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

  jobId?: string;

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
        sftTaskId: string;
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
        baseModelEvalResult?: RerankEvalResult;
        tunedModelEvalResult?: RerankEvalResult;
      };

      applying?: {
        versionId?: string;
        versionName?: string;
        previousModelConfigId?: string;
        previousTaskId?: string;
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
    baseModelEvalResult: RerankEvalResult;
    tunedModelEvalResult: RerankEvalResult;
    versionId: string;
    versionName: string;
    previousModelConfigId: string;
    previousTaskId: string;
    updatedNodesCount: number;
  };

  errorMsg?: EnhancedErrorMessage;

  jobId?: string;

  createTime: Date;
  updateTime: Date;
  finishTime?: Date;
};
