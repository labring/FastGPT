import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  OwnerPermissionVal,
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
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
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
    const dataset = await MongoDataset.create({
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
        resourceId: dataset._id,
        collaborators: parentClbsAndGroups,
        session
      });
    }

    if (!parentId) {
      await MongoResourcePermission.create(
        [
          {
            resourceType: PerResourceTypeEnum.dataset,
            teamId,
            resourceId: dataset._id,
            tmbId,
            permission: OwnerPermissionVal
          }
        ],
        { session }
      );
    }
  });

  return {};
}
export default NextAPI(handler);
