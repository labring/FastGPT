/* vector crud */
import { PgVectorCtrl } from './pg';
import { ObVectorCtrl } from './oceanbase';
import { getVectorsByText } from '../../core/ai/embedding';
import type { EmbeddingRecallCtrlProps } from './controller.d';
import { type DelDatasetVectorCtrlProps, type InsertVectorProps } from './controller.d';
import { type EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, PG_ADDRESS, OCEANBASE_ADDRESS } from './constants';
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

const getVectorObj = () => {
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl();
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
export const recallFromVectorStore = (props: EmbeddingRecallCtrlProps) =>
  retryFn(() => Vector.embRecall(props));
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

export const insertDatasetDataVector = async ({
  model,
  inputs,
  ...props
}: InsertVectorProps & {
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

  teamVectorCache.incr(props.teamId, insertIds.length);

  return {
    tokens,
    insertIds
  };
};

export const deleteDatasetDataVector = async (props: DelDatasetVectorCtrlProps) => {
  const result = await retryFn(() => Vector.delete(props));
  teamVectorCache.delete(props.teamId);
  return result;
};
