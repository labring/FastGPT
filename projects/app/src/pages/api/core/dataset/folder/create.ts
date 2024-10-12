import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getResourceClbsAndGroups } from '@fastgpt/service/support/permission/controller';
import { syncCollaborators } from '@fastgpt/service/support/permission/inheritPermission';
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

  const { tmbId, teamId } = await authUserPer({
    req,
    per: WritePermissionVal,
    authToken: true
  });

  if (parentId) {
    await authDataset({
      datasetId: parentId,
      per: WritePermissionVal,
      req,
      authToken: true
    });
  }

  await mongoSessionRun(async (session) => {
    const app = await MongoDataset.create({
      ...parseParentIdInMongo(parentId),
      avatar: FolderImgUrl,
      name,
      intro,
      teamId,
      tmbId,
      type: DatasetTypeEnum.folder
    });

    if (parentId) {
      const parentClbsAndGroups = await getResourceClbsAndGroups({
        teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      });

      await syncCollaborators({
        resourceType: PerResourceTypeEnum.dataset,
        teamId,
        resourceId: app._id,
        collaborators: parentClbsAndGroups,
        session
      });
    }
  });

  return {};
}
export default NextAPI(handler);
