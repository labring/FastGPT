import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { listChangedFiles } from './utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  TrainingModeEnum,
  TrainingStatusEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  createOneCollection,
  delCollectionAndRelatedSources
} from '@fastgpt/service/core/dataset/collection/controller';

const supportFileTypes = [
  'txt',
  'csv',
  'json',
  'md',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx'
];

type PutifileResp<T> = {
  /** 状态码 */
  code: number;
  /** 消息 */
  msg: string;
  /** 数据 */
  data: T;
};
type PutifileFileItemResp = {
  /** 文件ID */
  id: string;
  /** 文件名 */
  fileName: string;
  /** 文件大小 */
  fileSize?: number;
  /** 文件标签列表 */
  tags?: string[];
  /** 文件创建时间 */
  createdTime?: number;
  /** 文件更新时间 */
  updatedTime?: number;
};

/**
 * putifile 文件同步请求参数
 */
type PutifileSyncProps = {
  datasetId: string;
  billId: string;
};

/**
 * putifile 文件同步
 * 1、拉取putifile文件列表
 * 2、创建数据集（每个文件一个数据集），初始化数据集的知识就绪状态为待同步
 * 3、将文件放入嵌入向量处理队列
 * @param req putifile文件同步请求
 */
async function handler(req: ApiRequestProps<PutifileSyncProps>): Promise<boolean> {
  const { datasetId, billId } = req.body as {
    datasetId: string;
    billId: string;
  };

  if (!datasetId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { teamId, tmbId, dataset, permission } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  // 获取文件列表
  let folder = `${dataset.putifileConfig?.biz}/${dataset.putifileConfig?.folder}`;
  folder = folder.replace(/\/\//g, '/');
  if (!folder.endsWith('/')) {
    folder = folder + '/';
  }
  const files = await listChangedFiles({
    folder,
    lastSyncTime: dataset.putifileConfig?.lastSyncTime || 0
  });
  console.log('====> filesResponse:', files);
  if (!files || files.length === 0) {
    return true;
  }

  // 创建数据集下集合
  await mongoSessionRun(async (session) => {
    let lastSyncTime = 0;
    for (const file of files) {
      lastSyncTime = file.updatedTime || 0;
      const { id: fileId, fileName, tags } = file;
      // 排除掉不能解析的文件列表(根据后缀名来判断，不区分大小写)
      if (fileName.indexOf('.') < 0) {
        console.log(`文件名不合法：${fileName}, 忽略`);
        continue;
      }
      const fileExtension = fileName.split('.')[1];
      if (!supportFileTypes.includes(fileExtension.toLowerCase())) {
        console.log(`不支持的文件类型：${fileName}, 忽略`);
        continue;
      }
      // 删除原有数据集合
      const collections = await MongoDatasetCollection.find({
        datasetId: datasetId,
        externalFileId: fileId
      });
      let collection;
      if (collections && collections.length > 0) {
        collection = collections[0];
        await delCollectionAndRelatedSources({ collections: collections, session });
      }
      // 创建数据集合
      const { _id: collectionId } = await createOneCollection({
        teamId,
        tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.putiFile,
        name: fileName,
        fileId: undefined,
        metadata: {},
        tags: [...(collection?.tags || []), ...(tags || [])],

        // special metadata
        trainingStatus: TrainingStatusEnum.pending,
        trainingType: TrainingModeEnum.chunk,
        chunkSize: 700,
        chunkSplitter: undefined,
        qaPrompt: undefined,

        externalFileId: fileId,
        externalFileUrl: undefined,

        hashRawText: undefined,
        rawTextLength: undefined,

        createTime: collection?.createTime || new Date(),
        updateTime: new Date(),

        session
      });
    }
    if (lastSyncTime > 0) {
      await MongoDataset.updateOne(
        { _id: datasetId },
        {
          $set: {
            trainingStatus: DatasetStatusEnum.active,
            'putifileConfig.lastSyncTime': lastSyncTime,
            updateTime: new Date()
          }
        },
        { session }
      );
    }
  });
  return true;
}

export default NextAPI(handler);
