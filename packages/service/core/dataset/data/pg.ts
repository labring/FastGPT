import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import { delay } from '@fastgpt/global/common/system/utils';
import { PgClient } from '../../../common/pg';

export async function deletePgDataById(
  where: ['id' | 'dataset_id' | 'collection_id' | 'data_id', string] | string
) {
  let retry = 2;
  async function deleteData(): Promise<any> {
    try {
      await PgClient.delete(PgDatasetTableName, {
        where: [where]
      });
    } catch (error) {
      if (--retry < 0) {
        return Promise.reject(error);
      }
      await delay(500);
      return deleteData();
    }
  }

  await deleteData();

  return {
    tokenLen: 0
  };
}
