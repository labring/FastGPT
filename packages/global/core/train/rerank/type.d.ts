import type {
  RerankTrainsetStatusEnum,
  RerankTrainDataSourceEnum,
  RerankTrainTaskStatusEnum,
  RerankTaskCheckpointStageEnum,
  RerankTrainMethodEnum
} from './constants';
import type { EnhancedErrorMessage } from './error';
import type { DatasetDataIndexTypeEnum } from '../../dataset/data/constants';

/**
 * Detailed evaluation results from DiTing
 * Contains various ranking metrics at different k values
 */
export interface RerankDiTingDetailedResults {
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
  detailed_results: RerankDiTingDetailedResults;
  mrr_scores?: Record<string, number[]>;
  ndcg_scores?: Record<string, number[]>;
  map_scores?: Record<string, number[]>;
  precision_scores?: Record<string, number[]>;
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
export interface RerankTrainsetStatistics {
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
  teamId: string;
  tmbId: string;

  name: string;
  description?: string;

  status: `${RerankTrainsetStatusEnum}`;
  errorMsg?: EnhancedErrorMessage;

  jobId?: string;

  createTime: Date;
  updateTime: Date;

  statistics?: RerankTrainsetStatistics;
};

/** Rerank training data schema */
export type RerankTrainsetDataSchemaType = {
  _id: string;
  trainsetId: string;
  teamId: string;

  query: string;
  positiveDocs: string[];
  negativeDocs: string[];

  source: `${RerankTrainDataSourceEnum}`;

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
      weights?: Record<string, number>;
      forceRegenerate?: boolean;
      indexType: `${DatasetDataIndexTypeEnum}`;
      indexMultiStrategy?: 1 | 2;
      negativeStrategy?: 1 | 2 | 3 | 4;
      minNegativeSamples?: number;
      maxNegativeSamples?: number;
    };
  };

  createTime: Date;
};

/** Rerank training task schema */
export type RerankTrainTaskSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;

  name: string;
  /** Base model ID (BaseModelItemType.id) */
  baseModelId: string;
  baseModelEndpoint: {
    base_url?: string;
    api_key?: string;
    model: string;
  };

  /** Training type: lora or task_tuning, defaults to lora */
  trainMethod?: `${RerankTrainMethodEnum}`;
  /** Train dataset ID (exact mode: passed at create; auto mode: written by generate_trainset stage) */
  trainsetId?: string;
  /** Eval dataset ID (exact mode: passed at create; auto mode: written by generate_evaldataset stage) */
  evalDatasetId?: string;
  /** Knowledge base IDs used for trainset/evaldataset generation and model evaluation */
  datasetIds: string[];
  /** Optional name for the trained model */
  newModelName?: string;

  /** Trainset synthesis config stored at task level — passed to data generation queue */
  generateConfig?: {
    sampleSize?: number;
    weights?: Record<string, number>;
    indexType: `${DatasetDataIndexTypeEnum}`;
    indexMultiStrategy?: 1 | 2;
    negativeStrategy?: 1 | 2 | 3 | 4;
    minNegativeSamples?: number;
    maxNegativeSamples?: number;
  };

  status: RerankTrainTaskStatusEnum;

  checkpoint: {
    stage: `${RerankTaskCheckpointStageEnum}` | null;
    data?: {
      generate_trainset?: {
        trainDatasetId: string;
        trainDatasetFilePath: string;
        /** true = trainset was auto-generated by this task; false/absent = user-provided (exact mode) */
        autoGenerated?: boolean;
      };

      generate_evaldataset?: {
        evalDatasetId: string;
        evalDatasetFilePath: string;
        /** true = eval dataset was auto-generated by this task; false/absent = user-provided (exact mode) */
        autoGenerated?: boolean;
      };

      eval_basemodel?: {
        baseModelEvalResult: RerankEvalResult;
        /** Per-query ranked document IDs from rerank evaluation (indexed by eval data item _id) */
        rankingResults?: Array<{ itemId: string; rankedIds: string[] }>;
      };

      finetuning?: {
        sftTaskId: string;
        tunedModelEndpoint?: {
          base_url: string;
          api_key: string;
          model: string;
        };
      };

      registering?: {
        tunedModelId: string;
      };

      eval_tunedmodel?: {
        tunedModelEvalResult: RerankEvalResult;
        /** Per-query ranked document IDs from rerank evaluation (indexed by eval data item _id) */
        rankingResults?: Array<{ itemId: string; rankedIds: string[] }>;
      };

      llm_judge?: {
        /** LLM-judged relevant chunk IDs per query (replaces original expectedContextIds) */
        judgedExpectedIds: Array<{ itemId: string; expectedIds: string[] }>;
        /** Baseline metrics recomputed with judged expectedContextIds */
        baseModelRejudgedResult: RerankEvalResult;
        /** Tuned metrics recomputed with judged expectedContextIds */
        tunedModelRejudgedResult: RerankEvalResult;
      };
    };
    stageEndTime?: {
      generate_trainset?: Date;
      generate_evaldataset?: Date;
      eval_basemodel?: Date;
      finetuning?: Date;
      registering?: Date;
      eval_tunedmodel?: Date;
    };
  };

  result?: {
    trainDatasetId: string;
    trainDatasetFilePath: string;
    tunedModelId: string;
    evalDatasetId: string;
    evalDatasetFilePath: string;
    baseModelEvalResult: RerankEvalResult;
    tunedModelEvalResult: RerankEvalResult;
    /** Re-judged metrics (from llm_judge stage, if available) */
    baseModelRejudgedResult?: RerankEvalResult;
    tunedModelRejudgedResult?: RerankEvalResult;
  };

  errorMsg?: EnhancedErrorMessage;

  jobId?: string;

  createTime: Date;
  updateTime: Date;
  finishTime?: Date;
};
