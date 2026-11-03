import { type DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset } from './schema';
import { delCollectionRelatedSource } from './collection/controller';
import { deleteCollectionPermissions } from '../../support/permission/collection/controller';
import { type ClientSession } from '../../common/mongo';
import { MongoDatasetTraining } from './training/schema';
import { MongoDatasetData } from './data/schema';
import { deleteDatasetDataVector } from '../../common/vectorDB/controller';
import { getFullTextStore } from './data/textStore';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { UserError } from '@fastgpt/global/common/error/utils';
import { MongoDatasetSynonym, MongoDatasetSynonymMapping } from './synonym/schema';
import { invalidateDatasetSynonymMatcherCache } from './synonym/entity';
import {
  s3FileDeleteMQService,
  type S3MQJobData
} from '@fastgpt/dal/redis/bullmq/services/s3FileDelete';
import { S3Buckets } from '../../common/s3/config/constants';
import { getChunkImageCleanupJobs, parseChunkImageKey } from './data/inlineImages/utils';
import { isAuthorizedDatasetFileS3Key } from '../../common/s3/sources/dataset/key';

/* ============= dataset ========== */
/* find all datasetId by top datasetId */
export async function findDatasetAndAllChildren({
  teamId,
  datasetId,
  fields
}: {
  teamId: string;
  datasetId: string;
  fields?: string;
}): Promise<DatasetSchemaType[]> {
  const find = async (id: string) => {
    const children = await MongoDataset.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let datasets = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      datasets = datasets.concat(grandChildrenIds);
    }

    return datasets;
  };
  const [dataset, childDatasets] = await Promise.all([
    MongoDataset.findById(datasetId).lean(),
    find(datasetId)
  ]);

  if (!dataset) {
    return Promise.reject(new UserError('Dataset not found'));
  }

  return [dataset, ...childDatasets];
}

export async function getCollectionWithDataset(collectionId: string) {
  const data = await MongoDatasetCollection.findById(collectionId)
    .populate<{ dataset: DatasetSchemaType }>('dataset')
    .lean();
  if (!data) {
    return Promise.reject(DatasetErrEnum.unExistCollection);
  }
  return data;
}

/**
 * 清理同一团队的知识库内容，返回本次旧资源的 S3 删除范围。
 * 实际删库使用总目录；保留知识库的清空只处理旧资源，避免延迟任务误删后续导入。
 * 调用方在最外层事务提交后投递现有队列，不在 TTL 中保存目录或业务任务。
 */
export async function delDatasetRelevantData({
  datasets,
  session,
  deleteDataset = false
}: {
  datasets: { _id: string; teamId: string }[];
  session: ClientSession;
  /** 仅实际删除知识库时允许回收总目录；清空保留库时必须按旧资源范围回收。 */
  deleteDataset?: boolean;
}) {
  if (!datasets.length) return [];

  const teamId = datasets[0].teamId;

  if (!teamId) {
    return Promise.reject(new UserError('TeamId is required'));
  }

  const datasetIds = datasets.map((item) => item._id);

  // Get _id, teamId, fileId, metadata.relatedImgId for all collections
  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: datasetIds }
    },
    '_id teamId datasetId fileId metadata chunkImagePrefixId'
  )
    .session(session)
    .lean();
  const cleanupJobs: S3MQJobData[] = await (async () => {
    if (deleteDataset)
      // datasetId 来自可信的知识库记录；尾部斜线防止目录范围扩大到相近 ID。
      return datasetIds.map((id) => ({ bucketName: S3Buckets.private, prefix: `dataset/${id}/` }));

    // 保留知识库时需在删数据前保存旧独立图片和源文件范围，不能清理整个库目录。
    const images = await MongoDatasetData.find({
      teamId,
      datasetId: { $in: datasetIds },
      imageId: { $exists: true }
    })
      .select('datasetId imageId')
      .session(session)
      .lean();
    const keys = [
      ...new Set(
        [
          ...collections.map(({ datasetId, fileId }) => ({ datasetId, key: fileId })),
          ...images.map(({ datasetId, imageId }) => ({ datasetId, key: imageId }))
        ].flatMap(({ datasetId, key }) =>
          key &&
          !parseChunkImageKey(key) &&
          isAuthorizedDatasetFileS3Key({ key, datasetId: String(datasetId) })
            ? [key]
            : []
        )
      )
    ];
    return [
      ...getChunkImageCleanupJobs(collections),
      ...(keys.length ? [{ bucketName: S3Buckets.private, keys }] : [])
    ];
  })();

  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  }).session(session);

  // 同义词配置和映射属于 dataset 数据，即使功能关闭也必须随知识库删除。
  await MongoDatasetSynonymMapping.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  }).session(session);
  await MongoDatasetSynonym.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  }).session(session);

  // Delete dataset_data_texts(store 分发:mongo 真实删除,milvus 空操作——全文随向量删除)
  await getFullTextStore().deleteByDatasetIds({ teamId, datasetIds }, session);
  // 与旧资源快照同事务删除，避免重试时数据已被事务外删除而丢失 imageId 清理范围。
  for (const datasetId of datasetIds) {
    await MongoDatasetData.deleteMany({
      teamId,
      datasetId
    })
      .session(session)
      .maxTimeMS(300000);
  }

  await delCollectionRelatedSource({ collections, session });
  // Delete vector data
  await deleteDatasetDataVector({ teamId, datasetIds });

  // delete collections and their permission snapshots (same transaction)
  const collectionIds = collections.map((item) => String(item._id));
  await MongoDatasetCollection.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  }).session(session);
  await deleteCollectionPermissions({ teamId, collectionIds, session });

  for (const datasetId of datasetIds) {
    invalidateDatasetSynonymMatcherCache({ teamId, datasetId });
  }
  return cleanupJobs;
}

/** 最外层事务提交后投递业务层确定的资源范围；失败向上抛出，不能声称任务已提交。 */
export const dispatchDatasetStorageCleanup = async (jobs: S3MQJobData[] = []) => {
  for (const job of jobs) await s3FileDeleteMQService.addJob(job);
};
