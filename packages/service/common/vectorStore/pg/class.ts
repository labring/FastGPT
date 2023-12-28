import {
  initPg,
  insertDatasetDataVector,
  updateDatasetDataVector,
  deleteDatasetDataVector,
  embeddingRecall
} from './controller';

export class PgVector {
  constructor() {}
  init = initPg;
  insert = insertDatasetDataVector;
  update = updateDatasetDataVector;
  delete = deleteDatasetDataVector;
  recall = embeddingRecall;
}
