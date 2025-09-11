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
import { DBDatasetVectorTableName, DBDatasetValueVectorTableName } from './constants';
const getVectorObj = () => {
  if (PG_ADDRESS) return new PgVectorCtrl();
  if (OCEANBASE_ADDRESS) return new ObVectorCtrl();
  if (MILVUS_ADDRESS) return new MilvusCtrl();

  return new PgVectorCtrl();
};

const getChcheKey = (teamId: string) => `${CacheKeyEnum.team_vector_count}:${teamId}`;
const onDelCache = throttle((teamId: string) => delRedisCache(getChcheKey(teamId)), 30000, {
  leading: true,
  trailing: true
});
const onIncrCache = (teamId: string) => incrValueToCache(getChcheKey(teamId), 1);

const Vector = getVectorObj();

export const initVectorStore = Vector.init;
export const recallFromVectorStore = (props: EmbeddingRecallCtrlProps) =>
  retryFn(() => Vector.embRecall(props));
export const databaseEmbeddingRecall = Vector.databaseEmbRecall;
export const getVectorDataByTime = Vector.getVectorDataByTime;

export const getVectorCountByTeamId = async (teamId: string) => {
  const key = getChcheKey(teamId);

  const countStr = await getRedisCache(key);
  if (countStr) {
    return Number(countStr);
  }

  const count = await Vector.getVectorCountByTeamId(teamId);

  await setRedisCache(key, count, CacheKeyEnumTime.team_vector_count);

  return count;
};

export const getVectorCountByDatasetId = Vector.getVectorCountByDatasetId;
export const getVectorCountByCollectionId = Vector.getVectorCountByCollectionId;

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

  onIncrCache(props.teamId);

  return {
    tokens,
    insertIds
  };
};

export const deleteDatasetDataVector = async (props: DelDatasetVectorCtrlProps) => {
  const result = await retryFn(() => Vector.delete(props));
  onDelCache(props.teamId);
  return result;
};

/*Database Dataset specific operations*/

// Beta
export const insertTableDescriptionVector = async ({
  model,
  query,
  teamId,
  datasetId,
  collectionId,
  table_des_index
}: {
  model: EmbeddingModelItemType;
  query: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  table_des_index: string;
}) => {
  return retryFn(async () => {
    const { vectors, tokens } = await getVectorsByText({
      model,
      input: query,
      type: 'db'
    });
    const { insertIds } = await Vector.insert({
      teamId,
      datasetId,
      collectionId,
      vectors: vectors,
      table_des_index,
      tableName: DBDatasetVectorTableName
    });

    onIncrCache(teamId);

    return {
      tokens,
      insertIds
    };
  });
};

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
    const { vectors, tokens } = await getVectorsByText({
      model,
      input: query,
      type: 'db'
    });
    const { insertIds } = await Vector.insert({
      teamId,
      datasetId,
      collectionId,
      vectors: vectors,
      column_des_index,
      tableName: DBDatasetVectorTableName
    });

    console.debug('insertCoulmnDescriptionVector', { insertIds });
    onIncrCache(teamId);

    return {
      tokens,
      insertIds
    };
  });
};

export const insertTableValueVector = async ({
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
    const { vectors, tokens } = await getVectorsByText({
      model,
      input: query,
      type: 'db'
    });

    const { insertIds } = await Vector.insert({
      teamId,
      datasetId,
      collectionId,
      vectors: vectors,
      column_val_index,
      tableName: DBDatasetValueVectorTableName
    });

    return {
      tokens,
      insertIds
    };
  });
};
