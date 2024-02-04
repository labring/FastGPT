/* vector crud */
import { PgVector } from './pg/class';
import { getVectorsByText } from '../../core/ai/embedding';
import { InsertVectorProps } from './controller.d';

const getVectorObj = () => {
  return new PgVector();
};

export const initVectorStore = getVectorObj().init;
export const deleteDatasetDataVector = getVectorObj().delete;
export const recallFromVectorStore = getVectorObj().recall;
export const getVectorDataByTime = getVectorObj().getVectorDataByTime;
export const getVectorCountByTeamId = getVectorObj().getVectorCountByTeamId;

export const insertDatasetDataVector = async ({
  model,
  query,
  ...props
}: InsertVectorProps & {
  query: string;
  model: string;
}) => {
  const { vectors, tokens } = await getVectorsByText({
    model,
    input: query
  });
  const { insertId } = await getVectorObj().insert({
    ...props,
    vectors
  });

  return {
    tokens,
    insertId
  };
};

export const updateDatasetDataVector = async ({
  id,
  query,
  model
}: {
  id: string;
  query: string;
  model: string;
}) => {
  // get vector
  const { vectors, tokens } = await getVectorsByText({
    model,
    input: query
  });

  await getVectorObj().update({
    id,
    vectors
  });

  return {
    tokens
  };
};
