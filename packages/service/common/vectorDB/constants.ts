export const DatasetVectorDbName = 'fastgpt';
export const DatasetVectorTableName = 'modeldata';

export const PG_ADDRESS = process.env.PG_URL;
export const OCEANBASE_ADDRESS = process.env.OCEANBASE_URL;
export const SEEKDB_ADDRESS = process.env.SEEKDB_URL;
export const MILVUS_ADDRESS = process.env.MILVUS_ADDRESS;
export const MILVUS_TOKEN = process.env.MILVUS_TOKEN;

export const VectorVQ = (() => {
  if (process.env.VECTOR_VQ_LEVEL === '32') {
    return 32;
  }
  if (process.env.VECTOR_VQ_LEVEL === '16') {
    return 16;
  }
  if (process.env.VECTOR_VQ_LEVEL === '8') {
    return 8;
  }
  if (process.env.VECTOR_VQ_LEVEL === '4') {
    return 4;
  }
  if (process.env.VECTOR_VQ_LEVEL === '2') {
    return 2;
  }
  return 32;
})();
