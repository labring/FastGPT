/* vector crud */
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { SeekVectorCtrl } from './seekdb';
import { OpenGaussVectorCtrl } from './opengauss';
import { getVectors } from '../../core/ai/embedding';
import type { GetVectorsProps } from '../../core/ai/embedding';
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

type DatasetVectorInput = string | GetVectorsProps['inputs'][number];

/**
 * 统一写入知识库索引向量。
 *
 * `inputs` 的 text/image 类型只用于告诉 embedding 模型如何生成向量；
 * 进入向量库时已经统一成 number[][]，向量库本身不区分文本向量或图片向量。
 * 传入 string 时保持旧行为，默认按文本生成 embedding。
 */
export const insertDatasetDataVector = async ({
  model,
  inputs,
  ...props
}: Omit<InsertVectorControllerPropsType, 'vectors'> & {
  inputs: DatasetVectorInput[];
  model: EmbeddingModelItemType;
}) => {
  if (inputs.length === 0) {
    return {
      tokens: 0,
      insertIds: []
    };
  }

  const embeddingInputs = inputs.map((input) =>
    typeof input === 'string'
      ? {
          type: 'text' as const,
          input
        }
      : input
  );
  const { vectors, tokens } = await getVectors({
    model,
    inputs: embeddingInputs,
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
