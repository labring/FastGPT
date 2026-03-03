/* vector crud */
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { SeekVectorCtrl } from './seekdb';
import { getVectorsByText } from '../../core/ai/embedding';
import type { VectorControllerType, InsertVectorControllerPropsType } from './type';
import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, PG_ADDRESS, OCEANBASE_ADDRESS, SEEKDB_ADDRESS } from './constants';
import { MilvusCtrl } from './milvus';
import {
  setRedisCache,
  getRedisCache,
  delRedisCache,
  incrValueToCache,
  CacheKeyEnum,
  CacheKeyEnumTime
} from '../redis/cache';
import { throttle } from 'lodash';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { DBDatasetVectorTableName, DBDatasetValueVectorTableName } from './constants';
import { addLog } from '../system/log';

const getVectorObj = (): VectorControllerType => {
  if (SEEKDB_ADDRESS) return new SeekVectorCtrl({ type: 'seekdb' });
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl({ type: 'oceanbase' });
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();

  return new PgVectorCtrl();
};

const teamVectorCache = {
  getKey: function (teamId: string) {
    return `${CacheKeyEnum.team_vector_count}:${teamId}`;
  },
  get: async function (teamId: string) {
    const countStr = await getRedisCache(teamVectorCache.getKey(teamId));
    if (countStr) {
      return Number(countStr);
    }
    return undefined;
  },
  set: function ({ teamId, count }: { teamId: string; count: number }) {
    retryFn(() =>
      setRedisCache(teamVectorCache.getKey(teamId), count, CacheKeyEnumTime.team_vector_count)
    ).catch();
  },
  delete: throttle(
    function (teamId: string) {
      return retryFn(() => delRedisCache(teamVectorCache.getKey(teamId))).catch();
    },
    30000,
    {
      leading: true,
      trailing: true
    }
  ),
  incr: function (teamId: string, count: number) {
    retryFn(() => incrValueToCache(teamVectorCache.getKey(teamId), count)).catch();
  }
};

const Vector = getVectorObj();

export const initVectorStore = Vector.init;
export const recallFromVectorStore: VectorControllerType['embRecall'] = (props) =>
  retryFn(() => Vector.embRecall(props));
export const databaseEmbeddingRecall = Vector.databaseEmbRecall;
export const getVectorDataByTime = Vector.getVectorDataByTime;

export const insertDatasetDataVector = async ({
  model,
  inputs,
  ...props
}: Omit<InsertVectorControllerPropsType, 'vectors'> & {
  inputs: string[];
  model: EmbeddingModelItemType;
}) => {
  const { vectors, tokens } = await getVectorsByText({
    model,
    input: inputs,
    type: 'db'
  });
  // 使用分批插入
  const batchSize = 10;
  const allInsertIds: string[] = [];

  const insertData = async (startIndex: number) => {
    const batchVectors = vectors.slice(startIndex, startIndex + batchSize);

    if (batchVectors.length === 0) return;

    try {
      const { insertIds } = await retryFn(() =>
        Vector.insert({
          ...props,
          vectors: batchVectors
        })
      );

      if (insertIds) {
        allInsertIds.push(...insertIds);
      }
    } catch (error) {
      throw error;
    }

    return insertData(startIndex + batchSize);
  };

  await insertData(0);

  teamVectorCache.incr(props.teamId, allInsertIds.length);

  return {
    tokens,
    insertIds: allInsertIds
  };
};

export const deleteDatasetDataVector: VectorControllerType['delete'] = async (props) => {
  const result = await retryFn(() => Vector.delete(props));
  teamVectorCache.delete(props.teamId);
  return result;
};

// Count vector
export const getVectorCountByTeamId = async (teamId: string) => {
  const cacheCount = await teamVectorCache.get(teamId);
  if (cacheCount !== undefined) {
    return cacheCount;
  }

  const count = await Vector.getVectorCount({ teamId });

  teamVectorCache.set({
    teamId,
    count
  });

  return count;
};
export const getVectorCount = Vector.getVectorCount;

/* Database Dataset specific operations */
export const insertCoulmnDescriptionVector = async ({
  model,
  query,
  teamId,
  datasetId,
  collectionId,
  column_des_index
}: {
  model: EmbeddingModelItemType;
  query: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  column_des_index: string;
}) => {
  return retryFn(async () => {
    // Step 1: Get vectors from text (Embedding)
    let vectors: number[][];
    let tokens: number;
    try {
      const result = await getVectorsByText({
        model,
        input: query,
        type: 'db'
      });
      vectors = result.vectors;
      tokens = result.tokens;
    } catch (error: any) {
      throw new Error(`Embedding Error: ${error?.message || 'Unknown error'}`);
    }

    // Step 2: Insert vectors to database
    let insertIds: string[];
    try {
      const result = await Vector.insert({
        teamId,
        datasetId,
        collectionId,
        vectors: vectors,
        column_des_index,
        tableName: DBDatasetVectorTableName
      });
      insertIds = result.insertIds;
    } catch (error: any) {
      throw new Error(`Vector Insert Error: ${error?.message || 'Unknown error'}`);
    }

    addLog.debug('insertCoulmnDescriptionVector', { insertIds });
    teamVectorCache.incr(teamId, insertIds.length);

    return {
      tokens,
      insertIds
    };
  });
};

export const insertColumnValueVector = async ({
  model,
  query,
  teamId,
  datasetId,
  collectionId,
  column_val_index
}: {
  model: EmbeddingModelItemType;
  query: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  column_val_index: string;
}) => {
  return retryFn(async () => {
    // Step 1: Get vectors from text (Embedding)
    let vectors: number[][];
    let tokens: number;
    try {
      const result = await getVectorsByText({
        model,
        input: query,
        type: 'db'
      });
      vectors = result.vectors;
      tokens = result.tokens;
    } catch (error: any) {
      throw new Error(`Embedding Error: ${error?.message || 'Unknown error'}`);
    }

    // Step 2: Insert vectors to database
    let insertIds: string[];
    try {
      const result = await Vector.insert({
        teamId,
        datasetId,
        collectionId,
        vectors: vectors,
        column_val_index,
        tableName: DBDatasetValueVectorTableName
      });
      insertIds = result.insertIds;
    } catch (error: any) {
      throw new Error(`Vector Insert Error: ${error?.message || 'Unknown error'}`);
    }

    teamVectorCache.incr(teamId, insertIds.length);

    return {
      tokens,
      insertIds
    };
  });
};
