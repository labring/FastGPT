import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { type FileIdCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import {
  createCollectionAndInsertData,
  pushImageFileToTrainingQueue
} from '@fastgpt/service/core/dataset/collection/controller_imageFileId';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoRawTextBuffer } from '@fastgpt/service/common/buffer/rawText/schema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';

async function handler(
  req: ApiRequestProps<FileIdCreateDatasetCollectionParams>
): CreateCollectionResponse {
  const { fileId, customPdfParse, ...body } = req.body;
  console.log('收到API请求，参数body:', body);
  console.log('fileId:', fileId, 'customPdfParse:', customPdfParse);

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: body.datasetId
  });
  console.log('鉴权通过，teamId:', teamId, 'tmbId:', tmbId, 'dataset:', dataset?._id);

  // 1. read file
  const { rawText, filename } = await readFileContentFromMongo({
    teamId,
    tmbId,
    bucketName: BucketNameEnum.dataset,
    fileId,
    customPdfParse
  });
  console.log('文件读取完成，filename:', filename, 'rawText长度:', rawText?.length);

  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    rawText: '',
    createCollectionParams: {
      ...body,
      teamId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      name: '',
      fileId,
      metadata: {
        relatedImgId: fileId,
        isImageCollection: true
      },
      customPdfParse
    },
    relatedId: fileId,
    collectionId: body.parentId
  });
  console.log(
    '集合创建及数据插入完成，collectionId:',
    collectionId,
    'insertResults:',
    insertResults
  );

  // 2. 直接推送图片训练任务
  await pushImageFileToTrainingQueue({
    teamId,
    tmbId,
    datasetId: dataset._id,
    collectionId: collectionId || '',
    imageFileId: fileId,
    billId: undefined,
    model: dataset.vlmModel
  });

  // remove buffer
  await MongoRawTextBuffer.deleteOne({ sourceId: fileId });
  console.log('临时buffer已删除:', fileId);

  return {
    collectionId: collectionId || '',
    results: insertResults
  };
}

export default NextAPI(handler);
