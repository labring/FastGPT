import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ClientSession } from 'mongoose';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getResourceClbsAndGroups } from '@fastgpt/service/support/permission/controller';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamWritePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

export type DatasetUpdateQuery = {};
export type DatasetUpdateResponse = any;

async function handler(
  req: ApiRequestProps<DatasetUpdateBody, DatasetUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<DatasetUpdateResponse> {
  const { id, parentId, name, avatar, intro, agentModel, websiteConfig, externalReadUrl, status } =
    req.body;

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const isMove = parentId !== undefined;

  const { dataset, permission } = await authDataset({
    req,
    authToken: true,
    datasetId: id,
    per: WritePermissionVal
  });
  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      await authDataset({ req, authToken: true, datasetId: parentId, per: ManagePermissionVal });
    } else if (parentId === null || !dataset.parentId) {
      // move to root or move from root
      await authUserPer({
        req,
        authToken: true,
        per: TeamWritePermissionVal
      });
    }
    if (dataset.parentId) {
      // move from a folder, check the (old) folder's permission
      await authDataset({
        req,
        authToken: true,
        datasetId: dataset.parentId,
        per: ManagePermissionVal
      });
    } else {
      // move from root
      if (!permission.hasManagePer) return Promise.reject(DatasetErrEnum.unAuthDataset);
    }
  }

  const isFolder = dataset.type === DatasetTypeEnum.folder;

  const onUpdate = async (session?: ClientSession) => {
    await MongoDataset.findByIdAndUpdate(
      id,
      {
        ...parseParentIdInMongo(parentId),
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(agentModel && { agentModel: agentModel.model }),
        ...(websiteConfig && { websiteConfig }),
        ...(status && { status }),
        ...(intro !== undefined && { intro }),
        ...(externalReadUrl !== undefined && { externalReadUrl }),
        ...(isMove && { inheritPermission: true })
      },
      { session }
    );
  };

  if (isMove) {
    await mongoSessionRun(async (session) => {
      if (isFolder && dataset.inheritPermission) {
        const parentClbsAndGroups = await getResourceClbsAndGroups({
          teamId: dataset.teamId,
          resourceId: parentId,
          resourceType: PerResourceTypeEnum.dataset,
          session
        });

        await syncCollaborators({
          teamId: dataset.teamId,
          resourceId: id,
          resourceType: PerResourceTypeEnum.dataset,
          collaborators: parentClbsAndGroups,
          session
        });

        await syncChildrenPermission({
          resource: dataset,
          resourceType: PerResourceTypeEnum.dataset,
          resourceModel: MongoDataset,
          folderTypeList: [DatasetTypeEnum.folder],
          collaborators: parentClbsAndGroups,
          session
        });
        return onUpdate(session);
      }
      return onUpdate(session);
    });
  } else {
    return onUpdate();
  }
}
export default NextAPI(handler);
