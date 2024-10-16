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
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { getResourceClbsAndGroups } from '@fastgpt/service/support/permission/controller';
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
        ...(externalReadUrl !== undefined && { externalReadUrl })
      },
      { session }
    );
  };

  // move
  if (parentId !== undefined) {
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
