import { NextAPI } from '@/service/middleware/entry';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  DatasetTypeEnum,
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  getDefaultEmbeddingModel,
  getDefaultLLMModel,
  getDefaultVLMModel,
  getEmbeddingModel
} from '@fastgpt/service/core/ai/model';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { checkTeamDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { getFileById, delFileByFileIdList } from '@fastgpt/service/common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';

export type DatasetCreateWithFilesQuery = {};
export type DatasetCreateWithFilesBody = {
  datasetParams: {
    name: string;
    avatar: string;
    parentId?: string;
    vectorModel?: string;
    agentModel?: string;
    vlmModel?: string;
  };
  files: {
    fileId: string;
    name: string;
  }[];
};
export type DatasetCreateWithFilesResponse = {
  datasetId: string;
  name: string;
  avatar: string;
  vectorModel: EmbeddingModelItemType;
};

async function handler(
  req: ApiRequestProps<DatasetCreateWithFilesBody, DatasetCreateWithFilesQuery>
): Promise<DatasetCreateWithFilesResponse> {
  const { datasetParams, files } = req.body;
  const {
    parentId,
    name,
    avatar,
    vectorModel = getDefaultEmbeddingModel()?.model,
    agentModel = getDefaultLLMModel()?.model,
    vlmModel = getDefaultVLMModel()?.model
  } = datasetParams;

  const { teamId, tmbId, userId } = parentId
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

  // check limit
  await checkTeamDatasetLimit(teamId);

  try {
    const result = await mongoSessionRun(async (session) => {
      // 1. Create dataset
      const [dataset] = await MongoDataset.create(
        [
          {
            ...parseParentIdInMongo(parentId),
            name,
            teamId,
            tmbId,
            vectorModel,
            agentModel,
            vlmModel,
            avatar,
            intro: '',
            type: DatasetTypeEnum.dataset
          }
        ],
        { session, ordered: true }
      );

      // 2. Create permission
      await MongoResourcePermission.insertOne({
        teamId,
        tmbId,
        resourceId: dataset._id,
        permission: OwnerRoleVal,
        resourceType: PerResourceTypeEnum.dataset
      });

      // 3. Refresh avatar
      await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

      // 4. Create collections for each file
      for (const file of files) {
        const gridFile = await getFileById({
          bucketName: BucketNameEnum.dataset,
          fileId: file.fileId
        });

        if (!gridFile) {
          return Promise.reject(CommonErrEnum.fileNotFound);
        }

        await createCollectionAndInsertData({
          dataset,
          createCollectionParams: {
            datasetId: dataset._id,
            teamId,
            tmbId,
            type: DatasetCollectionTypeEnum.file,
            name: file.name || gridFile.filename,
            fileId: file.fileId,
            metadata: {
              relatedImgId: file.fileId
            },
            trainingType: DatasetCollectionDataProcessModeEnum.chunk,
            chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
            chunkTriggerMinSize: 1000,
            chunkSettingMode: ChunkSettingModeEnum.auto,
            chunkSplitMode: DataChunkSplitModeEnum.paragraph,
            chunkSize: 1024,
            indexSize: 512,
            customPdfParse: false
          },
          session
        });
      }

      return {
        datasetId: dataset._id,
        name: dataset.name,
        avatar: dataset.avatar,
        vectorModel: getEmbeddingModel(dataset.vectorModel)
      };
    });

    // Track and audit log
    pushTrack.createDataset({
      type: DatasetTypeEnum.dataset,
      teamId,
      tmbId,
      uid: userId
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.CREATE_DATASET,
        params: {
          datasetName: name,
          datasetType: getI18nDatasetType(DatasetTypeEnum.dataset)
        }
      });
    })();

    return result;
  } catch (error) {
    const fileIds = files.map((file) => file.fileId);
    await delFileByFileIdList({
      bucketName: BucketNameEnum.dataset,
      fileIdList: fileIds
    });

    return Promise.reject(error);
  }
}

export default NextAPI(handler);
