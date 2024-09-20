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
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetDefaultPermissionVal } from '@fastgpt/global/support/permission/dataset/constant';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { getResourceAllClbs } from '@fastgpt/service/support/permission/controller';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';

export type DatasetUpdateQuery = {};
export type DatasetUpdateResponse = any;

async function handler(
  req: ApiRequestProps<DatasetUpdateBody, DatasetUpdateQuery>,
  _res: ApiResponseType<any>
): Promise<DatasetUpdateResponse> {
  const {
    id,
    parentId,
    name,
    avatar,
    intro,
    agentModel,
    websiteConfig,
    externalReadUrl,
    defaultPermission,
    status
  } = req.body;

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { dataset } = (await (async () => {
    if (defaultPermission !== undefined) {
      return await authDataset({ req, authToken: true, datasetId: id, per: ManagePermissionVal });
    } else {
      return await authDataset({ req, authToken: true, datasetId: id, per: WritePermissionVal });
    }
  })()) as { dataset: DatasetSchemaType };

  const isDefaultPermissionChanged =
    defaultPermission !== undefined && dataset.defaultPermission !== defaultPermission;
  const isFolder = dataset.type === DatasetTypeEnum.folder;

  const onUpdate = async (
    session?: ClientSession,
    updatedDefaultPermission?: PermissionValueType
  ) => {
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
        // move
        ...(updatedDefaultPermission !== undefined && {
          defaultPermission: updatedDefaultPermission
        }),
        // update the defaultPermission
        ...(dataset.parentId && isDefaultPermissionChanged && { inheritPermission: false })
      },
      { session }
    );
  };

  // move
  if (parentId !== undefined) {
    await mongoSessionRun(async (session) => {
      const parentDefaultPermission = await (async () => {
        if (parentId) {
          const { dataset: parentDataset } = await authDataset({
            req,
            authToken: true,
            datasetId: parentId,
            per: WritePermissionVal
          });
          return parentDataset.defaultPermission;
        }
        return DatasetDefaultPermissionVal;
      })();

      if (isFolder && dataset.inheritPermission) {
        const parentClbs = await getResourceAllClbs({
          teamId: dataset.teamId,
          resourceId: parentId,
          resourceType: PerResourceTypeEnum.dataset,
          session
        });

        await syncCollaborators({
          teamId: dataset.teamId,
          resourceId: id,
          resourceType: PerResourceTypeEnum.dataset,
          collaborators: parentClbs,
          session
        });

        await syncChildrenPermission({
          resource: dataset,
          resourceType: PerResourceTypeEnum.dataset,
          resourceModel: MongoDataset,
          folderTypeList: [DatasetTypeEnum.folder],
          collaborators: parentClbs,
          defaultPermission: parentDefaultPermission,
          session
        });
        return onUpdate(session, parentDefaultPermission);
      }
      return onUpdate(session);
    });
  } else if (isDefaultPermissionChanged) {
    await mongoSessionRun(async (session) => {
      if (isFolder) {
        await syncChildrenPermission({
          defaultPermission,
          resource: {
            _id: dataset._id,
            type: dataset.type,
            teamId: dataset.teamId,
            parentId: dataset.parentId
          },
          resourceType: PerResourceTypeEnum.dataset,
          resourceModel: MongoDataset,
          folderTypeList: [DatasetTypeEnum.folder],
          session
        });
      } else if (dataset.inheritPermission && dataset.parentId) {
        const parentClbs = await getResourceAllClbs({
          teamId: dataset.teamId,
          resourceId: parentId,
          resourceType: PerResourceTypeEnum.dataset,
          session
        });

        await syncCollaborators({
          teamId: dataset.teamId,
          resourceId: id,
          resourceType: PerResourceTypeEnum.dataset,
          collaborators: parentClbs,
          session
        });
      }
      return onUpdate(session, defaultPermission);
    });
  } else {
    return onUpdate();
  }
}
export default NextAPI(handler);
