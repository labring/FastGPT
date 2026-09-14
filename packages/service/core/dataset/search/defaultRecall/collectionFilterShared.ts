import { MongoDatasetCollection } from '../../collection/schema';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { computeFilterIntersection } from '../utils';

type CollectionMetadataMatch = {
  createTime?: { $gte?: string; $lte?: string };
  collectionIds?: string[];
};

/**
 * 将文件或文件夹 ID 展开为真正可召回的非文件夹 Collection ID。
 * 查询始终受 teamId + datasetIds 限制，防止跨知识库展开。
 */
export const expandCollectionIds = async ({
  teamId,
  datasetIds,
  parentCollectionIds
}: {
  teamId: string;
  datasetIds: string[];
  parentCollectionIds?: string[];
}): Promise<string[] | undefined> => {
  if (!parentCollectionIds) return;
  if (parentCollectionIds.length === 0) return [];

  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: datasetIds },
      _id: { $in: parentCollectionIds }
    },
    '_id type',
    { ...readFromSecondary }
  ).lean();

  const resultIds = new Set(
    collections.filter((item) => item.type !== 'folder').map((item) => String(item._id))
  );
  const folderIds = collections
    .filter((item) => item.type === 'folder')
    .map((item) => String(item._id));

  if (folderIds.length > 0) {
    const children = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        parentId: { $in: folderIds }
      },
      '_id',
      { ...readFromSecondary }
    ).lean();
    const childIds = await expandCollectionIds({
      teamId,
      datasetIds,
      parentCollectionIds: children.map((item) => String(item._id))
    });
    childIds?.forEach((id) => resultIds.add(id));
  }

  return [...resultIds];
};

/** 将标签结果与时间、Collection ID 条件求交，新旧标签链路共用。 */
export const applySharedCollectionMetadataFilters = async ({
  teamId,
  datasetIds,
  metadataMatch,
  tagCollectionIds
}: {
  teamId: string;
  datasetIds: string[];
  metadataMatch: CollectionMetadataMatch;
  tagCollectionIds?: string[];
}): Promise<string[] | undefined> => {
  const getCreateTime = metadataMatch.createTime?.$gte;
  const lteCreateTime = metadataMatch.createTime?.$lte;
  const createTimeCollectionIds =
    getCreateTime || lteCreateTime
      ? (
          await MongoDatasetCollection.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              createTime: {
                ...(getCreateTime ? { $gte: new Date(getCreateTime) } : {}),
                ...(lteCreateTime ? { $lte: new Date(lteCreateTime) } : {})
              }
            },
            '_id',
            { ...readFromSecondary }
          )
        ).map((item) => String(item._id))
      : undefined;

  const inputCollectionIds =
    Array.isArray(metadataMatch.collectionIds) && metadataMatch.collectionIds.length > 0
      ? await expandCollectionIds({
          teamId,
          datasetIds,
          parentCollectionIds: metadataMatch.collectionIds
        })
      : undefined;
  if (inputCollectionIds?.length === 0) return [];

  const collectionIds = computeFilterIntersection([
    tagCollectionIds,
    createTimeCollectionIds,
    inputCollectionIds
  ]);

  return expandCollectionIds({ teamId, datasetIds, parentCollectionIds: collectionIds });
};
