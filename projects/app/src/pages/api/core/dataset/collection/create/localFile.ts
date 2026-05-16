import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByLocalFileBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import crypto from 'crypto';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(documentFileType)
    });
    filepaths.push(result.fileMetadata.path);

    const collectionData = CreateCollectionByLocalFileBodySchema.parse(result.data);

    const { teamId, tmbId, dataset } = collectionData.parentId
      ? await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: collectionData.parentId,
          per: WritePermissionVal
        }).then((res) => {
          if (
            result.data.datasetId &&
            String(res.collection.datasetId) !== String(result.data.datasetId)
          ) {
            return Promise.reject(DatasetErrEnum.unAuthDataset);
          }
          return {
            teamId: res.teamId,
            tmbId: res.tmbId,
            dataset: res.collection.dataset
          };
        })
      : await authDataset({
          req,
          authToken: true,
          authApiKey: true,
          per: WritePermissionVal,
          datasetId: result.data.datasetId
        });

    // Check dataset limit
    await checkDatasetIndexLimit({
      teamId,
      insertLen: 1
    });

    const collectionName = decodeURIComponent(result.fileMetadata.originalname);

    // 文件内容 MD5 去重：计算上传文件的 MD5，在 dataset_collections 表中
    // 按 { datasetId, type, fileMd5 } 联合索引查询，命中则拒绝上传。
    // 注意：本条为 OpenAPI 入口，无前端预计算 MD5 流程，此处为本链路的唯一一次计算，
    // 无前后端不一致风险，因此使用后端 crypto 直接计算。
    // 算法层面：crypto.createHash('md5') 与前端 SparkMD5 对相同字节序列产生的结果完全一致，
    // 两者均为标准 MD5 算法，不存在算法差异。
    // 查询条件仅限制 type=file，不包含文件夹和外部链接等其他类型。
    const fileBuffer = result.getBuffer();
    const fileMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    const existingCollection = await MongoDatasetCollection.findOne(
      {
        datasetId: dataset._id,
        type: DatasetCollectionTypeEnum.file,
        fileMd5
      },
      '_id name'
    ).lean();

    if (existingCollection) {
      return Promise.reject(DatasetErrEnum.fileContentDuplicate);
    }

    const fileId = await getS3DatasetSource().upload({
      datasetId: dataset._id,
      stream: result.getReadStream(),
      size: result.fileMetadata.size,
      filename: collectionName
    });

    return await createCollectionAndInsertData({
      dataset,
      createCollectionParams: {
        ...collectionData,
        datasetId: dataset._id,
        name: collectionName,
        teamId,
        tmbId,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        fileMd5,
        metadata: {
          ...collectionData.metadata,
          relatedImgId: fileId
        }
      }
    });
  } catch (error) {
    return Promise.reject(error);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);
