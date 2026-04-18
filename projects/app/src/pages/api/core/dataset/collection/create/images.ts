import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type CreateCollectionWithResultResponseType } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import {
  createCollectionAndInsertData,
  delCollection
} from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addDays, addSeconds } from 'date-fns';
import fs from 'node:fs';
import { getFileS3Key, uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

const ALLOWED_IMAGE_MIMETYPES = new Set(['image/jpeg', 'image/png']);

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveMultipleFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize
    });
    filepaths.push(...result.fileMetadata.map((item) => item.path));
    const { parentId, datasetId, collectionName, overwriteDuplicate } = result.data;

    // 校验文件类型，只允许图片格式
    const invalidFiles = result.fileMetadata.filter(
      (file) => !ALLOWED_IMAGE_MIMETYPES.has(file.mimetype)
    );
    if (invalidFiles.length > 0) {
      return Promise.reject(i18nT('file:image_unsupported_file_type'));
    }

    const { dataset, teamId, tmbId } = await authDataset({
      datasetId,
      per: WritePermissionVal,
      req,
      authToken: true,
      authApiKey: true
    });

    const planStatus = await getTeamPlanStatus({ teamId });
    await authFrequencyLimit({
      eventId: `${tmbId}-uploadfile`,
      maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
      expiredTime: addSeconds(new Date(), 30), // 30s
      num: result.fileMetadata.length
    });

    const hasVlm = !!dataset.vlmModel;
    const hasCustomParse = !!(
      global.systemEnv.customPdfParse?.url && global.systemEnv.customPdfParse?.key
    );
    if (!hasVlm && !hasCustomParse) {
      return Promise.reject(i18nT('file:Image_dataset_requires_VLM_model_to_be_configured'));
    }

    // 构造父目录查询条件
    const parentQuery: Record<string, any> = parentId
      ? { parentId }
      : { $or: [{ parentId: null }, { parentId: { $exists: false } }] };

    let finalCollectionName = collectionName;

    if (overwriteDuplicate) {
      // 覆盖模式：先删除同名 collection
      const existingCollection = await MongoDatasetCollection.findOne(
        { datasetId, name: collectionName, ...parentQuery },
        '_id'
      );
      if (existingCollection) {
        const collections = await findCollectionAndChild({
          teamId,
          datasetId,
          collectionId: String(existingCollection._id),
          fields: '_id teamId datasetId fileId metadata'
        });
        await mongoSessionRun((session) =>
          delCollection({ collections, delImg: true, delFile: true, session })
        );
      }
    } else {
      // 继续上传模式：若同名则加 (N) 数字后缀
      const existingCollection = await MongoDatasetCollection.findOne(
        { datasetId, name: collectionName, ...parentQuery },
        '_id'
      );
      if (existingCollection) {
        const lastDotIndex = collectionName.lastIndexOf('.');
        const nameWithoutExt =
          lastDotIndex > 0 ? collectionName.substring(0, lastDotIndex) : collectionName;
        const nameExt = lastDotIndex > 0 ? collectionName.substring(lastDotIndex) : '';

        const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedBase = escapeRegex(nameWithoutExt);
        const escapedExt = escapeRegex(nameExt);

        const existingNames = await MongoDatasetCollection.find(
          {
            datasetId,
            name: { $regex: `^${escapedBase}\\(\\d+\\)${escapedExt}$` },
            ...parentQuery
          },
          'name'
        ).lean();

        let maxSuffix = 0;
        const suffixRegex = new RegExp(`^${escapedBase}\\((\\d+)\\)${escapedExt}$`);
        for (const doc of existingNames) {
          const match = doc.name.match(suffixRegex);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSuffix) maxSuffix = num;
          }
        }

        finalCollectionName = `${nameWithoutExt}(${maxSuffix + 1})${nameExt}`;
      }
    }

    const imageIds = await Promise.all(
      result.fileMetadata.map(async (file) => {
        const filename = decodeURIComponent(file.originalname);
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

    return createCollectionAndInsertData({
      dataset,
      imageIds,
      createCollectionParams: {
        parentId,
        teamId,
        tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.images,
        name: finalCollectionName,
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
