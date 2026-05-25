import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { removeS3TTL } from '@fastgpt/service/common/s3/utils';
import {
  CreateTextCollectionBodySchema,
  CreateCollectionWithResultResponseSchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import crypto from 'crypto';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const { name, text, ...body } = CreateTextCollectionBodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = body.parentId
    ? await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId: body.parentId,
        per: WritePermissionVal
      }).then((res) => {
        if (body.datasetId && String(res.collection.datasetId) !== String(body.datasetId)) {
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
        datasetId: body.datasetId,
        per: WritePermissionVal
      });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: 1
  });

  const filename = `${name}.txt`;

  // 文本内容 MD5 去重：将文本转为 buffer 计算 MD5，在 dataset_collections 中
  // 按 { datasetId, type=file, fileMd5 } 联合索引查重，命中则拒绝。
  // 注意：文本输入无前端预计算 MD5 流程，此处为本链路的唯一一次计算，
  // 无前后端不一致风险，因此使用后端 crypto 直接计算。
  // 算法层面：crypto.createHash('md5') 与前端 SparkMD5 对相同字节序列产生的结果完全一致，
  // 两者均为标准 MD5 算法，不存在算法差异。
  // MD5 基于 Buffer.from(text) 的字节序列计算，
  // 同一段文本内容（相同编码、相同字符）会命中相同 MD5。
  const buffer = Buffer.from(text);
  const fileMd5 = crypto.createHash('md5').update(buffer).digest('hex');

  const existingCollection = await MongoDatasetCollection.findOne(
    {
      datasetId: body.datasetId,
      type: DatasetCollectionTypeEnum.file,
      fileMd5
    },
    '_id name'
  ).lean();

  if (existingCollection) {
    return Promise.reject(DatasetErrEnum.fileContentDuplicate);
  }

  const s3DatasetSource = getS3DatasetSource();
  const key = await s3DatasetSource.upload({
    datasetId: String(dataset._id),
    buffer,
    filename,
    contentType: 'text/plain; charset=UTF-8'
  });

  const res = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      fileId: key,
      name: filename,
      fileMd5
    }
  });
  await removeS3TTL({ key, bucketName: 'private' });
  return res;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default NextAPI(handler);
