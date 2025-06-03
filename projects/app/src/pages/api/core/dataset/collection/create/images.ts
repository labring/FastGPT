import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import type { ImageCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { CreateCollectionResponse } from '@/global/core/dataset/api';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import type { NextApiResponse } from 'next';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addSeconds } from 'date-fns';
import { createDatasetImage } from '@fastgpt/service/core/dataset/image/controller';

const authUploadLimit = (tmbId: string, num: number) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30), // 30s
    num
  });
};

async function handler(
  req: ApiRequestProps<ImageCreateDatasetCollectionParams>,
  res: NextApiResponse<any>
): CreateCollectionResponse {
  const filePaths: string[] = [];

  try {
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    const {
      files,
      data: { parentId, datasetId, collectionName }
    } = await upload.getUploadFiles<ImageCreateDatasetCollectionParams>(req, res);
    filePaths.push(...files.map((item) => item.path));

    const { dataset, teamId, tmbId } = await authDataset({
      datasetId,
      per: WritePermissionVal,
      req,
      authToken: true,
      authApiKey: true
    });
    await authUploadLimit(tmbId, files.length);

    if (!dataset.vlmModel) {
      return Promise.reject(i18nT('file:Image_dataset_requires_VLM_model_to_be_configured'));
    }

    // 1. Save image to db
    const imageIds = await Promise.all(
      files.map(async (file) => {
        return (
          await createDatasetImage({
            teamId,
            datasetId,
            file
          })
        ).imageId;
      })
    );

    // 2. Create collection
    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      imageIds,
      createCollectionParams: {
        parentId,
        teamId,
        tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.images,
        name: collectionName,
        trainingType: DatasetCollectionDataProcessModeEnum.imageParse
      }
    });

    return {
      collectionId,
      results: insertResults
    };
  } catch (error) {
    return Promise.reject(error);
  } finally {
    removeFilesByPaths(filePaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
