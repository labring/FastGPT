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
  createDatasetPrefixCleanup,
  createChunkImagePrefixCleanup,
  createDatasetFileCleanup
} from '../../common/s3/lifecycle/entity';
import { dispatchS3LifecycleCleanup } from '../../common/s3/lifecycle/service';

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
 * 清理同一团队的知识库内容，并在调用方事务内登记 S3 清理范围。
 * 实际删库使用总目录；保留知识库的清空只处理旧集合资源，避免补投误删后续导入。
 * 返回的记录 ID 必须由最外层事务提交后派发，进程退出或队列故障由 cron 恢复。
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
  if (!datasets.length) return { cleanupIds: [] };

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
  const cleanupIds = deleteDataset
    ? await createDatasetPrefixCleanup({ datasetIds, session })
    : [
        ...(await createChunkImagePrefixCleanup({ scopes: collections, session })),
        ...(await createDatasetFileCleanup({ collections, session }))
      ];

  // delete training data
  await MongoDatasetTraining.deleteMany({
    teamId,
    datasetId: { $in: datasetIds }
  });

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
  // Delete dataset_datas in batches by datasetId
  for (const datasetId of datasetIds) {
    await MongoDatasetData.deleteMany({
      teamId,
      datasetId
    }).maxTimeMS(300000);
  }

  await delCollectionRelatedSource({ collections });
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
  return { cleanupIds };
}

/** 最外层事务提交后派发持久化资源任务；入队失败保留记录，由 cron 补投。 */
export const dispatchDatasetStorageCleanup = async (cleanup?: { cleanupIds: string[] }) => {
  await dispatchS3LifecycleCleanup(cleanup?.cleanupIds);
};
