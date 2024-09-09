import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { PutifileFileReCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  createOneCollection,
  delCollectionAndRelatedSources
} from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum,
  TrainingStatusEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

/**
 * putifile 重建数据集合
 */
async function handler(
  req: ApiRequestProps<PutifileFileReCreateDatasetCollectionParams>
): Promise<string> {
  const params = req.body as PutifileFileReCreateDatasetCollectionParams;
  console.log('putifile 重建数据集合:', params);
  if (!params.datasetId || !params.externalFileId || !params.externalFileUrl || !params.filename) {
    return Promise.reject(
      'datasetId and externalFileId and externalFileUrl and filename are required'
    );
  }

  // 获取团队ID和TMB ID
  const dataset = await MongoDataset.findOne({ _id: params.datasetId })
    .select('teamId tmbId')
    .lean();
  if (!dataset) {
    return Promise.reject('dataset not found');
  }

  // 重建数据集合
  await mongoSessionRun(async (session) => {
    // 删除原有数据集合
    let collection;
    if (params.id) {
      const collections = await MongoDatasetCollection.find({ fileId: params.id }).session(session);
      if (collections && collections.length > 0) {
        collection = collections[0];
        await delCollectionAndRelatedSources({ collections: collections, session });
      }
    }

    //console.log('putifile 重建数据集合:', collection);
    if (!collection) {
      // 创建
      // 创建数据集合
      const { _id: collectionId } = await createOneCollection({
        teamId: dataset.teamId,
        tmbId: dataset.tmbId,
        datasetId: params.datasetId,
        parentId: params.parentId,
        type: DatasetCollectionTypeEnum.externalFile,
        name: params.filename || '',
        forbid: false,
        tags: [],

        // special metadata
        trainingStatus: TrainingStatusEnum.pending,
        trainingType: params.trainingType || TrainingModeEnum.chunk,
        chunkSize: params.chunkSize || 700,
        chunkSplitter: params.chunkSplitter,
        qaPrompt: params.qaPrompt,

        externalFileId: params.externalFileId,
        externalFileUrl: params.externalFileUrl,

        hashRawText: undefined,
        rawTextLength: undefined,

        createTime: new Date(),
        updateTime: new Date(),

        session
      });
      return collectionId;
    }
    // 创建数据集合
    const { _id: collectionId } = await createOneCollection({
      _id: collection._id,
      teamId: collection.teamId,
      tmbId: collection.tmbId,
      datasetId: params.datasetId,
      type: DatasetCollectionTypeEnum.putiFile,
      name: params.filename || collection.name,
      forbid: false,
      tags: collection.tags,

      // special metadata
      trainingStatus: TrainingStatusEnum.pending,
      trainingType: params.trainingType || TrainingModeEnum.chunk,
      chunkSize: params.chunkSize || 700,
      chunkSplitter: params.chunkSplitter,
      qaPrompt: params.qaPrompt,

      externalFileId: params.externalFileId,
      externalFileUrl: params.externalFileUrl,

      hashRawText: undefined,
      rawTextLength: undefined,

      createTime: collection.createTime || new Date(),
      updateTime: new Date(),

      session
    });

    return collectionId;
  });

  return '';
}

export default NextAPI(handler);
