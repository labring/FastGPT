import { parseHeaderAuth } from '@fastgpt/service/support/permission/controller';
import { AuthModeType } from '@fastgpt/service/support/permission/type';
import { getTeamInfoByUIdAndTmbId } from '../../user/team/controller';
import {
  authDatasetFile as packageAuthDatasetFile,
  authDatasetCollection as packageAuthDatasetCollection,
  authDataset
} from '@fastgpt/service/support/permission/auth/dataset';
import { getDatasetPgData } from '@/service/core/dataset/data/controller';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
import {
  CollectionWithDatasetType,
  DatasetFileSchema,
  DatasetSchemaType,
  PgDataItemType
} from '@fastgpt/global/core/dataset/type';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/errorCode';

export async function authCreateDatasetCollection({
  req,
  authToken,
  ...props
}: AuthModeType & {
  datasetId: string;
}): Promise<
  AuthResponseType & {
    dataset: DatasetSchemaType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);
  const { dataset } = await authDataset({
    req,
    authToken,
    ...props,
    per: 'r'
  });

  if (team.role === TeamMemberRoleEnum.visitor) {
    return Promise.reject(DatasetErrEnum.unCreateCollection);
  }

  return {
    dataset,
    userId,
    teamId,
    tmbId,
    canWrite: team.role !== TeamMemberRoleEnum.visitor
  };
}

export async function authDatasetCollection({
  req,
  authToken,
  ...props
}: AuthModeType & {
  collectionId: string;
  per?: 'r' | 'w';
}): Promise<
  AuthResponseType & {
    collection: CollectionWithDatasetType;
  }
> {
  const { userId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });

  // get role
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  return packageAuthDatasetCollection({
    req,
    authToken,
    role: team.role,
    ...props
  });
}

/* permission same of collection */
export async function authDatasetData({
  req,
  authToken,
  dataId,
  per
}: AuthModeType & {
  dataId: string;
  per?: 'r' | 'w';
}): Promise<
  AuthResponseType & {
    datasetData: PgDataItemType;
  }
> {
  const { userId, teamId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });
  // get pg data
  const datasetData = await getDatasetPgData({ id: dataId });

  const { canWrite } = await authDatasetCollection({
    req,
    authToken,
    collectionId: datasetData.collectionId,
    per
  });

  return {
    userId,
    teamId,
    tmbId,
    datasetData,
    canWrite
  };
}

export async function authDatasetFile({
  req,
  authToken,
  ...props
}: AuthModeType & {
  fileId: string;
  per?: 'r' | 'w';
}): Promise<
  AuthResponseType & {
    file: DatasetFileSchema;
  }
> {
  const { userId, tmbId } = await parseHeaderAuth({
    req,
    authToken
  });

  // get role
  const team = await getTeamInfoByUIdAndTmbId(userId, tmbId);

  return packageAuthDatasetFile({
    req,
    authToken,
    role: team.role,
    ...props
  });
}
