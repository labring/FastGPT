import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
export type DatasetFolderCreateQuery = {};
export type DatasetFolderCreateBody = {
  parentId?: string;
  name: string;
  intro: string;
};
export type DatasetFolderCreateResponse = {};
async function handler(
  req: ApiRequestProps<DatasetFolderCreateBody, DatasetFolderCreateQuery>,
  _res: ApiResponseType<any>
): Promise<DatasetFolderCreateResponse> {
  const { parentId, name, intro } = req.body;

  if (!name) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId, tmbId } = parentId
    ? await authDataset({
        req,
        datasetId: parentId,
        authToken: true,
        authApiKey: true,
        per: WritePermissionVal
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamDatasetCreatePermissionVal
      });

  await mongoSessionRun(async (session) => {
    const dataset = await MongoDataset.create({
      ...parseParentIdInMongo(parentId),
      avatar: FolderImgUrl,
      name,
      intro,
      teamId,
      tmbId,
      type: DatasetTypeEnum.folder
    });

    await createResourceDefaultCollaborators({
      tmbId,
      session,
      resource: dataset,
      resourceType: PerResourceTypeEnum.dataset
    });
  });
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_DATASET_FOLDER,
      params: {
        folderName: name
      }
    });
  })();

  return {};
}
export default NextAPI(handler);
