import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
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

// 更新知识库接口
// 包括如下功能：
// 1. 更新应用的信息（包括名称，类型，头像，介绍等）
// 2. 更新数据库的配置信息
// 3. 移动知识库
// 操作权限：
// 1. 更新信息和配置编排需要有知识库的写权限
// 2. 移动应用需要有
//  (1) 父目录的管理权限
//  (2) 目标目录的管理权限
//  (3) 如果从根目录移动或移动到根目录，需要有团队的应用创建权限
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
    per: ReadPermissionVal
  });
  if (isMove) {
    if (parentId) {
      // move to a folder, check the target folder's permission
      await authDataset({ req, authToken: true, datasetId: parentId, per: ManagePermissionVal });
    }
    if (dataset.parentId) {
      // move from a folder, check the (old) folder's permission
      await authDataset({
        req,
        authToken: true,
        datasetId: dataset.parentId,
        per: ManagePermissionVal
      });
    }
    if (parentId === null || !dataset.parentId) {
      // move to root or move from root
      await authUserPer({
        req,
        authToken: true,
        per: TeamWritePermissionVal
      });
    }
  } else {
    // is not move
    if (!permission.hasWritePer) return Promise.reject(DatasetErrEnum.unAuthDataset);
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
