import {
  initPg,
  insertDatasetDataVector,
  deleteDatasetDataVector,
  embeddingRecall,
  getVectorDataByTime,
  getVectorCountByTeamId,
  checkDataExist
} from './controller';

export class PgVector {
  constructor() {}
  init = initPg;
  insert = insertDatasetDataVector;
  delete = deleteDatasetDataVector;
  recall = embeddingRecall;
  checkDataExist = checkDataExist;
  getVectorCountByTeamId = getVectorCountByTeamId;
  getVectorDataByTime = getVectorDataByTime;
}
