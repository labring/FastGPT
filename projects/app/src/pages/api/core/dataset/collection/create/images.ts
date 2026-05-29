import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateImageCollectionFormSchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addDays, addSeconds } from 'date-fns';
import fs from 'node:fs';
import path from 'node:path';
import { getFileS3Key, uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { datasetImageCollectionFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveMultipleFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(datasetImageCollectionFileType)
    });
    filepaths.push(...result.fileMetadata.map((item) => item.path));
    const {
      parentId,
      datasetId,
      collectionName: _collectionName,
      overwriteDuplicate,
      fileMd5: frontendFileMd5
    } = CreateImageCollectionFormSchema.parse(result.data);

    let collectionName = _collectionName;

    const normalizedParentId = parentId && parentId.trim() !== '' ? parentId : undefined;

    const { dataset, teamId, tmbId } = normalizedParentId
      ? await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: normalizedParentId,
          per: WritePermissionVal
        }).then((res) => {
          if (datasetId && String(res.collection.datasetId) !== String(datasetId)) {
            return Promise.reject(DatasetErrEnum.unAuthDataset);
          }
          return {
            dataset: res.collection.dataset,
            teamId: res.teamId,
            tmbId: res.tmbId
          };
        })
      : await authDataset({
          datasetId,
          per: WritePermissionVal,
          req,
          authToken: true,
          authApiKey: true
        });

    // Check dataset limit
    await checkDatasetIndexLimit({
      teamId,
      insertLen: 1
    });

    const planStatus = await getTeamPlanStatus({ teamId });
    await authFrequencyLimit({
      eventId: `${tmbId}-uploadfile`,
      maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
      expiredTime: addSeconds(new Date(), 30), // 30s
      num: result.fileMetadata.length
    });

    const hasVlm = !!dataset.vlmModelId;
    const hasCustomParse = !!(
      global.systemEnv.customPdfParse?.url && global.systemEnv.customPdfParse?.key
    );
    if (!hasVlm && !hasCustomParse) {
      return Promise.reject(DatasetErrEnum.imageDatasetRequiresVlmModel);
    }

    // 使用前端计算的 MD5（SparkMD5），避免前后端计算不一致。
    // 单张图片上传时，fileMd5 为该图片的 MD5；
    // 多张图片上传时，前端对每张图片分别计算 MD5，按字典序排序后以逗号拼接作为集合指纹，
    // 用于后续同一组图片的去重判断。
    let fileMd5: string | undefined;
    if (result.fileMetadata.length >= 1) {
      fileMd5 = frontendFileMd5;
    }

    const imageIds = await Promise.all(
      result.fileMetadata.map(async (file) => {
        const filename = path.basename(file.filename);
        const { fileKey } = getFileS3Key.dataset({ datasetId, filename });
        return uploadImage2S3Bucket('private', {
          base64Img: (await fs.promises.readFile(file.path)).toString('base64'),
          uploadKey: fileKey,
          mimetype: file.mimetype,
          filename,
          expiredTime: addDays(new Date(), 7)
        });
      })
    );

    // Handle duplicate collection name (within transaction to avoid TOCTOU)
    let deletedCollectionId: string | undefined;
    let overwritten = false;

    await mongoSessionRun(async (session) => {
      const duplicateQuery: Record<string, any> = {
        datasetId,
        name: collectionName,
        type: DatasetCollectionTypeEnum.images
      };

      if (normalizedParentId) {
        duplicateQuery.parentId = normalizedParentId;
      } else {
        duplicateQuery.$or = [{ parentId: null }, { parentId: { $exists: false } }];
      }

      const existingCollection = await MongoDatasetCollection.findOne(duplicateQuery, '_id', {
        session
      });

      if (existingCollection) {
        if (overwriteDuplicate === true) {
          // Overwrite: delete old collection within the same transaction
          deletedCollectionId = String(existingCollection._id);

          const collections = await findCollectionAndChild({
            teamId,
            datasetId,
            collectionId: deletedCollectionId,
            fields: '_id teamId datasetId fileId metadata'
          });

          await delCollection({
            collections,
            delImg: true,
            delFile: false,
            session
          });

          overwritten = true;

          addLog.info(
            `[ImageImport] Overwritten collection: ${deletedCollectionId}, name: ${collectionName}`
          );
        } else {
          // No overwrite: add suffix to new collection name
          const lastDotIndex = collectionName.lastIndexOf('.');
          const nameWithoutExt =
            lastDotIndex > 0 ? collectionName.substring(0, lastDotIndex) : collectionName;
          const ext = lastDotIndex > 0 ? collectionName.substring(lastDotIndex) : '';

          // Escape special regex characters
          const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedBase = escapeRegex(nameWithoutExt);
          const escapedExt = escapeRegex(ext);

          // Query all existing collections with suffix pattern in the same folder
          const suffixQuery: Record<string, any> = {
            datasetId,
            name: { $regex: `^${escapedBase}\\(\\d+\\)${escapedExt}$` },
            type: DatasetCollectionTypeEnum.images
          };

          if (normalizedParentId) {
            suffixQuery.parentId = normalizedParentId;
          } else {
            suffixQuery.$or = [{ parentId: null }, { parentId: { $exists: false } }];
          }

          const existingNames = await MongoDatasetCollection.find(suffixQuery, 'name', {
            session
          }).lean();

          // Find max suffix from existing names
          let maxSuffix = 0;
          const suffixRegex = new RegExp(`^${escapedBase}\\((\\d+)\\)${escapedExt}$`);
          for (const doc of existingNames) {
            const match = doc.name.match(suffixRegex);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxSuffix) maxSuffix = num;
            }
          }

          collectionName = `${nameWithoutExt}(${maxSuffix + 1})${ext}`;

          addLog.info(
            `[ImageImport] Renamed duplicate collection from '${_collectionName}' to '${collectionName}'`
          );
        }
      }
    });

    return createCollectionAndInsertData({
      dataset,
      imageIds,
      createCollectionParams: {
        parentId: normalizedParentId,
        teamId,
        tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.images,
        name: collectionName,
        fileMd5,
        trainingType: DatasetCollectionDataProcessModeEnum.imageParse
      }
    });
  } catch (error) {
    return Promise.reject(error);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
