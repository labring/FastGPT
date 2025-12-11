import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { addLog } from '../../../common/system/log';
import { MongoDatasetData } from '../../dataset/data/schema';
import { Types } from 'mongoose';
import {
  DEFAULT_SEARCH_SIMILARITY,
  DEFAULT_SEARCH_LIMIT,
  TRAIN_DATA_SPLIT_RATIO
} from './constants';

/**
 * Concurrency control utility using promise limiting
 *
 * Limits the number of simultaneously executing promises to avoid resource exhaustion.
 *
 * @param concurrency - Maximum number of concurrent promises
 * @returns Limit function to wrap async functions
 *
 * @example
 * const limit = pLimit(5);
 * const results = await Promise.all(
 *   items.map(item => limit(() => processItem(item)))
 * );
 */
export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const resolve = queue.shift()!;
      resolve();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });
  };

  return run;
}

/**
 * Extract model configuration from app workflow
 *
 * Generic function supporting different model types (AI models, Rerank models, etc.).
 * Follows FastGPT workflow execution logic:
 * 1. Prioritize explicitly configured model in node
 * 2. Fall back to system default model if not configured
 *
 * @param app - App configuration
 * @param nodeType - Node type (e.g. FlowNodeTypeEnum.chatNode)
 * @param inputKey - Input key name (e.g. NodeInputKeyEnum.aiModel)
 * @param getDefaultModel - Function to get default model
 * @returns Model configuration ID
 */
export function extractModelFromApp(
  app: AppSchema,
  nodeType: `${FlowNodeTypeEnum}`,
  inputKey: `${NodeInputKeyEnum}`,
  getDefaultModel: () => { model: string } | undefined
): string {
  const targetNodes = app.modules?.filter((m) => m.flowNodeType === nodeType);

  for (const node of targetNodes || []) {
    const modelInput = node.inputs?.find((input) => input.key === inputKey);

    if (modelInput && modelInput.value) {
      const modelConfigId = String(modelInput.value);
      addLog.info(`Extracted model from app workflow (explicitly configured)`, {
        appId: String(app._id),
        nodeType,
        inputKey,
        modelConfigId
      });
      return modelConfigId;
    }
  }

  const defaultModel = getDefaultModel();

  if (!defaultModel) {
    throw new Error(
      `No default model available in system (appId: ${app._id}, nodeType: ${nodeType}, inputKey: ${inputKey})`
    );
  }

  addLog.info(`Using system default model (no explicit model configured in app workflow)`, {
    appId: String(app._id),
    nodeType,
    inputKey,
    modelConfigId: defaultModel.model
  });

  return defaultModel.model;
}

export interface DatasetSelectItem {
  datasetId: string;
  name: string;
  avatar: string;
  vectorModel?: {
    model: string;
    name: string;
  };
  datasetType?: string;
}

/** Extract dataset IDs from app configuration */
export function extractDatasetIdsFromApp(app: AppSchema): string[] {
  return app.modules
    .filter((m: StoreNodeItemType) => m.flowNodeType === FlowNodeTypeEnum.datasetSearchNode)
    .flatMap((m: StoreNodeItemType) => {
      const datasetInput = m.inputs?.find((input) => input.key === 'datasets');
      const datasets = datasetInput?.value as DatasetSelectItem[];

      if (Array.isArray(datasets)) {
        return datasets
          .filter((dataset) => dataset && typeof dataset.datasetId === 'string')
          .map((dataset) => dataset.datasetId);
      }
      return [];
    })
    .filter(Boolean);
}

/** Extract dataset search parameters from app configuration (excluding rerank) */
export function extractDatasetSearchParamsFromApp(app: AppSchema): {
  similarity: number;
  limit: number;
  searchMode: string;
  embeddingWeight?: number;
  collectionFilterMatch?: string;
  datasetSearchUsingExtensionQuery?: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg?: string;
} {
  const datasetSearchNode = app.modules?.find(
    (m: StoreNodeItemType) => m.flowNodeType === FlowNodeTypeEnum.datasetSearchNode
  );

  if (!datasetSearchNode) {
    return {
      similarity: DEFAULT_SEARCH_SIMILARITY,
      limit: DEFAULT_SEARCH_LIMIT,
      searchMode: 'embedding'
    };
  }

  const getInputValue = <T = unknown>(key: string, defaultValue: T): T => {
    const input = datasetSearchNode.inputs?.find((input) => input.key === key);
    return input?.value !== undefined ? (input.value as T) : defaultValue;
  };

  return {
    similarity: getInputValue('similarity', DEFAULT_SEARCH_SIMILARITY),
    limit: getInputValue('limit', DEFAULT_SEARCH_LIMIT),
    searchMode: getInputValue('searchMode', 'embedding'),
    embeddingWeight: getInputValue('embeddingWeight', undefined),
    collectionFilterMatch: getInputValue('collectionFilterMatch', undefined),
    datasetSearchUsingExtensionQuery: getInputValue('datasetSearchUsingExtensionQuery', undefined),
    datasetSearchExtensionModel: getInputValue('datasetSearchExtensionModel', undefined),
    datasetSearchExtensionBg: getInputValue('datasetSearchExtensionBg', undefined)
  };
}

/**
 * Sample dataset chunks for training or evaluation
 *
 * Supports three sampling modes:
 * 1. Train mode (datasetType: 'train'): Use first 80% of data
 * 2. Eval mode (datasetType: 'eval'): Use last 20% of data
 * 3. Random mode (datasetType: 'random'): Random sampling (requires sampleSize parameter)
 *
 * @param datasetIds - Dataset ID list
 * @param options - Sampling options
 * @param options.datasetType - Sampling mode: 'train' | 'eval' | 'random', default 'train'
 * @param options.sampleSize - Random sample size (only for datasetType='random')
 */
export async function sampleDataFromDataset(
  datasetIds: string[],
  options: {
    datasetType?: 'train' | 'eval' | 'random';
    sampleSize?: number;
  } = {}
): Promise<
  Array<{
    datasetId: string;
    dataId: string;
    q: string;
    a: string;
    indexes: [];
  }>
> {
  const { sampleSize, datasetType = 'train' } = options;

  if (datasetType === 'random' && !sampleSize) {
    throw new Error('sampleSize is required when datasetType is "random"');
  }
  if (datasetType !== 'random' && sampleSize) {
    addLog.warn('sampleSize is ignored when datasetType is not "random"', {
      datasetType,
      sampleSize
    });
  }

  const allSamples: Array<{
    datasetId: string;
    dataId: string;
    q: string;
    a: string;
    indexes: [];
  }> = [];

  for (const datasetId of datasetIds) {
    addLog.info('Sampling data from dataset', {
      datasetId,
      datasetType,
      sampleSize
    });

    const match = {
      datasetId: new Types.ObjectId(datasetId)
    };

    let sampleData;

    const totalCount = await MongoDatasetData.countDocuments(match);

    if (totalCount === 0) {
      addLog.warn('No data found in dataset', { datasetId });
      continue;
    }

    if (datasetType === 'random') {
      addLog.info('Using random sampling mode', {
        datasetId,
        sampleSize
      });

      sampleData = await MongoDatasetData.aggregate([
        {
          $match: match
        },
        {
          $sample: { size: sampleSize! }
        },
        {
          $project: {
            _id: 1,
            q: 1,
            a: 1,
            indexes: 1,
            datasetId: 1,
            collectionId: 1
          }
        }
      ]);
    } else if (datasetType === 'eval') {
      const trainCount = Math.floor(totalCount * TRAIN_DATA_SPLIT_RATIO);
      const evalCount = totalCount - trainCount;

      addLog.info('Using eval dataset mode (last 20%)', {
        datasetId,
        totalCount,
        trainCount,
        evalCount
      });

      sampleData = await MongoDatasetData.aggregate([
        {
          $match: match
        },
        {
          $skip: trainCount
        },
        {
          $limit: evalCount
        },
        {
          $project: {
            _id: 1,
            q: 1,
            a: 1,
            indexes: 1,
            datasetId: 1,
            collectionId: 1
          }
        }
      ]);
    } else {
      const trainCount = Math.floor(totalCount * TRAIN_DATA_SPLIT_RATIO);

      addLog.info('Using train dataset mode (first 80%)', {
        datasetId,
        totalCount,
        trainCount
      });

      sampleData = await MongoDatasetData.aggregate([
        {
          $match: match
        },
        {
          $limit: trainCount
        },
        {
          $project: {
            _id: 1,
            q: 1,
            a: 1,
            indexes: 1,
            datasetId: 1,
            collectionId: 1
          }
        }
      ]);
    }

    addLog.info('Dataset sampling result', {
      datasetId,
      datasetType,
      sampleCount: sampleData.length
    });

    const formattedData = sampleData.map((doc) => {
      return {
        datasetId: doc.datasetId.toString(),
        dataId: doc._id.toString(),
        q: doc.q,
        a: doc.a,
        indexes: doc.indexes
      };
    });

    allSamples.push(...formattedData);
  }

  addLog.info('Final sampling result', {
    totalDatasets: datasetIds.length,
    datasetType,
    totalSamples: allSamples.length
  });

  return allSamples;
}

/**
 * Build model endpoint configuration
 *
 * Converts model config object to OpenAI-compliant endpoint format.
 *
 * @param modelConfig - Model configuration with requestUrl, requestAuth, model fields
 * @returns OpenAI-compliant endpoint object
 */
export function buildModelEndpoint(modelConfig: {
  requestUrl?: string;
  requestAuth?: string;
  model: string;
}): {
  base_url?: string;
  api_key?: string;
  model: string;
} {
  const endpoint: {
    base_url?: string;
    api_key?: string;
    model: string;
  } = {
    model: modelConfig.model
  };

  if (modelConfig.requestUrl) {
    endpoint.base_url = modelConfig.requestUrl;
  }

  if (modelConfig.requestAuth) {
    endpoint.api_key = modelConfig.requestAuth;
  }

  return endpoint;
}
