import { parseHeaderAuth } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByUIdAndTmbId } from '../../user/team/controller';
import {
  authDatasetFile as packageAuthDatasetFile,
  authDatasetCollection as packageAuthDatasetCollection,
  authDataset as packageAuthDataset
} from '@fastgpt/service/support/permission/auth/dataset';
import { getDatasetPgData } from '@/service/core/dataset/data/controller';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import { DatasetFileSchema, PgDataItemType } from '@fastgpt/global/core/dataset/type';

export async function authDataset(
  props: AuthModeType & {
    datasetId: string;
  }
) {
  const { userId, tmbId } = await parseHeaderAuth(props);

  // get role
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  return packageAuthDataset({
    ...props,
    role: team.role
  });
}

export async function authDatasetCollection(
  props: AuthModeType & {
    collectionId: string;
  }
) {
  const { userId, tmbId } = await parseHeaderAuth(props);

  // get role
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  return packageAuthDatasetCollection({
    ...props,
    role: team.role
  });
}

/* permission same of collection */
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
  const { userId, teamId, tmbId } = await parseHeaderAuth(props);
  // get pg data
  const datasetData = await getDatasetPgData({ id: dataId });

  const isOwner = String(datasetData.tmbId) === tmbId;
  // data has the same permissions as collection
  const { canWrite } = await authDatasetCollection({
    ...props,
    collectionId: datasetData.collectionId
  });

  return {
    userId,
    teamId,
    tmbId,
    datasetData,
    isOwner,
    canWrite
  };
}

export async function authDatasetFile(
  props: AuthModeType & {
    fileId: string;
  }
): Promise<
  AuthResponseType & {
    file: DatasetFileSchema;
  }
> {
  const { userId, tmbId } = await parseHeaderAuth(props);

  // get role
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  return packageAuthDatasetFile({
    ...props,
    role: team.role
  });
}
