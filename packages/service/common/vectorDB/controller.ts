/* vector crud */
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { SeekVectorCtrl } from './seekdb';
import { OpenGaussVectorCtrl } from './opengauss';
import { getVectorsByText } from '../../core/ai/embedding';
import type { VectorControllerType, InsertVectorControllerPropsType } from './type';
import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import {
  MILVUS_ADDRESS,
  PG_ADDRESS,
  OPENGAUSS_ADDRESS,
  OCEANBASE_ADDRESS,
  SEEKDB_ADDRESS
} from './constants';
import { MilvusCtrl } from './milvus';
import {
  setRedisCache,
  getRedisCache,
  delRedisCache,
  CacheKeyEnum,
  CacheKeyEnumTime
} from '../redis/cache';
import { retryFn, withTimeout } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.INFRA.REDIS);
const TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS = 3000;

const runTeamVectorCacheOperation = async <T>({
  teamId,
  operation,
  warnMessage,
  action
}: {
  teamId: string;
  operation: string;
  warnMessage: string;
  action: () => Promise<T>;
}) => {
  try {
    return await withTimeout(
      action(),
      TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS,
      `${operation} timed out after ${TEAM_VECTOR_CACHE_OPERATION_TIMEOUT_MS}ms`
    );
  } catch (error) {
    logger.warn(warnMessage, { teamId, error });
    return undefined;
  }
};

const getVectorObj = (): VectorControllerType => {
  if (SEEKDB_ADDRESS) return new SeekVectorCtrl({ type: 'seekdb' });
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl({ type: 'oceanbase' });
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();
  if (OPENGAUSS_ADDRESS) return new OpenGaussVectorCtrl();

  return new PgVectorCtrl();
};

const teamVectorCache = {
  getKey: function (teamId: string) {
    return `${CacheKeyEnum.team_vector_count}:${teamId}`;
  },
  get: async function (teamId: string) {
    const countStr = await runTeamVectorCacheOperation({
      teamId,
      operation: 'Get team vector count cache',
      warnMessage: 'Failed to get team vector count cache',
      action: () => getRedisCache(teamVectorCache.getKey(teamId))
    });
    if (countStr) {
      return Number(countStr);
    }
    return undefined;
  },
  set: function ({ teamId, count }: { teamId: string; count: number }) {
    void runTeamVectorCacheOperation({
      teamId,
      operation: 'Set team vector count cache',
      warnMessage: 'Failed to set team vector count cache',
      action: () =>
        retryFn(() =>
          setRedisCache(teamVectorCache.getKey(teamId), count, CacheKeyEnumTime.team_vector_count)
        )
    });
  },
  invalidate: async function (teamId: string) {
    await runTeamVectorCacheOperation({
      teamId,
      operation: 'Invalidate team vector count cache',
      warnMessage: 'Failed to invalidate team vector count cache',
      action: () => delRedisCache(teamVectorCache.getKey(teamId))
    });
  }
};

const Vector = getVectorObj();

export const initVectorStore = Vector.init;
export const recallFromVectorStore: VectorControllerType['embRecall'] = (props) =>
  retryFn(() => Vector.embRecall(props));

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
  const { insertIds } = await retryFn(() =>
    Vector.insert({
      ...props,
      vectors
    })
  );

  await teamVectorCache.invalidate(props.teamId);

  return {
    tokens,
    insertIds
  };
};

export const insertDatasetDataPrecomputedVector = async ({
  vectors,
  ...props
}: InsertVectorControllerPropsType) => {
  const { insertIds } = await retryFn(() =>
    Vector.insert({
      ...props,
      vectors
    })
  );

  teamVectorCache.incr(props.teamId, insertIds.length);

  return {
    tokens: 0,
    insertIds
  };
};

export const deleteDatasetDataVector: VectorControllerType['delete'] = async (props) => {
  const result = await retryFn(() => Vector.delete(props));
  await teamVectorCache.invalidate(props.teamId);
  return result;
};

export const getVectorDataByTime = Vector.getVectorDataByTime;

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
