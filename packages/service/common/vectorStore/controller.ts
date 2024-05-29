/* vector crud */
import { PgVector } from './pg/class';
import { getVectorsByText } from '../../core/ai/embedding';
import { InsertVectorProps } from './controller.d';
import { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import { MILVUS_ADDRESS, PG_ADDRESS } from './constants';
import { getMilvusClient } from './milvus/class';

const getVectorObj = () => {
  if (MILVUS_ADDRESS) return getMilvusClient();
  if (PG_ADDRESS) return new PgVector();

  return new PgVector();
};

const Vector = getVectorObj();

export const initVectorStore = Vector.init;
export const deleteDatasetDataVector = Vector.delete;
export const recallFromVectorStore = Vector.recall;
export const getVectorDataByTime = Vector.getVectorDataByTime;
export const getVectorCountByTeamId = Vector.getVectorCountByTeamId;

export const insertDatasetDataVector = async ({
  model,
  query,
  ...props
}: InsertVectorProps & {
  query: string;
  model: VectorModelItemType;
}) => {
  const { vectors, tokens } = await getVectorsByText({
    model,
    input: query,
    type: 'db'
  });
  const { insertId } = await getVectorObj().insert({
    ...props,
    vector: vectors[0]
  });

  return {
    tokens,
    insertId
  };
};
