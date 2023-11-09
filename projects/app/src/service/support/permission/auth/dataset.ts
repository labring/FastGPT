import { getDatasetPgData } from '@/service/core/dataset/data/controller';
import { PgDataItemType } from '@fastgpt/global/core/dataset/type';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';

export async function authDatasetData({
  dataId,
  ...props
}: AuthModeType & {
  dataId: string;
}): Promise<
  AuthResponseType & {
    datasetData: PgDataItemType;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId } = result;
  // get pg data
  const datasetData = await getDatasetPgData({ id: dataId });

  const isOwner = String(datasetData.tmbId) === tmbId;
  // data has the same permissions as collection
  const { canWrite } = await authDatasetCollection({
    ...props,
    collectionId: datasetData.collectionId
  });

  return {
    ...result,
    datasetData,
    isOwner,
    canWrite
  };
}
