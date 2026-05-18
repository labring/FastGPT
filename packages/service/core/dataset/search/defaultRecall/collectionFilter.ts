import json5 from 'json5';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetCollectionTags } from '../../tag/schema';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { computeFilterIntersection } from '../utils';

export const getForbidCollectionIdList = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: datasetIds },
      forbid: true
    },
    '_id'
  );

  return collections.map((item) => String(item._id));
};

/**
 * 按知识库集合元数据过滤 collectionId。
 *
 * 标签过滤保持原有语义：`$and` 优先生效，且 `$and` 中字符串标签和 null 不能共存。
 * 输入 collectionIds 可以是文件夹，会递归展开为实际文件集合。
 */
export const filterCollectionByMetadata = async ({
  teamId,
  datasetIds,
  collectionFilterMatch
}: {
  teamId: string;
  datasetIds: string[];
  collectionFilterMatch?: string;
}): Promise<string[] | undefined> => {
  const getAllCollectionIds = async ({
    parentCollectionIds
  }: {
    parentCollectionIds?: string[];
  }): Promise<string[] | undefined> => {
    if (!parentCollectionIds) return;
    if (parentCollectionIds.length === 0) {
      return [];
    }

    const collections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        _id: { $in: parentCollectionIds }
      },
      '_id type',
      {
        ...readFromSecondary
      }
    ).lean();

    const resultIds = new Set<string>();
    collections.forEach((item) => {
      if (item.type !== 'folder') {
        resultIds.add(String(item._id));
      }
    });

    const folderIds = collections
      .filter((item) => item.type === 'folder')
      .map((item) => String(item._id));

    // Get all child collection ids
    if (folderIds.length) {
      const childCollections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          parentId: { $in: folderIds }
        },
        '_id type',
        {
          ...readFromSecondary
        }
      ).lean();

      const childIds = await getAllCollectionIds({
        parentCollectionIds: childCollections.map((item) => String(item._id))
      });

      childIds?.forEach((id) => resultIds.add(id));
    }

    return Array.from(resultIds);
  };

  if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

  let tagCollectionIdList: string[] | undefined = undefined;
  let createTimeCollectionIdList: string[] | undefined = undefined;
  let inputCollectionIdList: string[] | undefined = undefined;

  try {
    const jsonMatch = json5.parse(collectionFilterMatch);

    const andTags = jsonMatch?.tags?.$and as (string | null)[] | undefined;
    const orTags = jsonMatch?.tags?.$or as (string | null)[] | undefined;

    if (andTags && andTags.length > 0) {
      const uniqueAndTags = Array.from(new Set(andTags));
      if (uniqueAndTags.includes(null) && uniqueAndTags.some((tag) => typeof tag === 'string')) {
        return [];
      }
      if (uniqueAndTags.every((tag) => typeof tag === 'string')) {
        const matchedTags = await MongoDatasetCollectionTags.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            tag: { $in: uniqueAndTags as string[] }
          },
          '_id datasetId tag',
          { ...readFromSecondary }
        ).lean();

        // Group tags by dataset
        const datasetTagMap = new Map<string, { tagIds: string[]; tagNames: Set<string> }>();

        matchedTags.forEach((tag) => {
          const datasetId = String(tag.datasetId);
          if (!datasetTagMap.has(datasetId)) {
            datasetTagMap.set(datasetId, {
              tagIds: [],
              tagNames: new Set()
            });
          }

          const datasetData = datasetTagMap.get(datasetId)!;
          datasetData.tagIds.push(String(tag._id));
          datasetData.tagNames.add(tag.tag);
        });

        const validDatasetIds = Array.from(datasetTagMap.entries())
          .filter(([, data]) => uniqueAndTags.every((tag) => data.tagNames.has(tag as string)))
          .map(([datasetId]) => datasetId);

        if (validDatasetIds.length === 0) return [];

        const collectionsPromises = validDatasetIds.map((datasetId) => {
          const { tagIds } = datasetTagMap.get(datasetId)!;
          return MongoDatasetCollection.find(
            {
              teamId,
              datasetId,
              tags: { $all: tagIds }
            },
            '_id',
            { ...readFromSecondary }
          ).lean();
        });

        const collectionsResults = await Promise.all(collectionsPromises);
        tagCollectionIdList = collectionsResults.flat().map((item) => String(item._id));
      } else if (uniqueAndTags.every((tag) => tag === null)) {
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }]
          },
          '_id',
          { ...readFromSecondary }
        ).lean();
        tagCollectionIdList = collections.map((item) => String(item._id));
      }
    } else if (orTags && orTags.length > 0) {
      // Get tagId by tag string
      const orTagArray = await MongoDatasetCollectionTags.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          tag: { $in: orTags.filter((tag) => tag !== null) }
        },
        '_id',
        { ...readFromSecondary }
      ).lean();
      const orTagIds = orTagArray.map((item) => String(item._id));

      // Get collections by tagId
      const collections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          $or: [
            { tags: { $in: orTagIds } },
            ...(orTags.includes(null) ? [{ tags: { $size: 0 } }] : [])
          ]
        },
        '_id',
        { ...readFromSecondary }
      ).lean();

      tagCollectionIdList = collections.map((item) => String(item._id));
    }

    // time
    const getCreateTime = jsonMatch?.createTime?.$gte as string | undefined;
    const lteCreateTime = jsonMatch?.createTime?.$lte as string | undefined;
    if (getCreateTime || lteCreateTime) {
      const collections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          createTime: {
            ...(getCreateTime && { $gte: new Date(getCreateTime) }),
            ...(lteCreateTime && {
              $lte: new Date(lteCreateTime)
            })
          }
        },
        '_id'
      );
      createTimeCollectionIdList = collections.map((item) => String(item._id));
    }

    // collectionIds
    const inputCollectionIds = jsonMatch?.collectionIds as string[] | undefined;
    if (Array.isArray(inputCollectionIds) && inputCollectionIds.length > 0) {
      inputCollectionIdList = await getAllCollectionIds({
        parentCollectionIds: inputCollectionIds
      });
      if (inputCollectionIdList && inputCollectionIdList.length === 0) {
        return [];
      }
    }

    // Concat tag, time and collectionIds
    const collectionIds = computeFilterIntersection([
      tagCollectionIdList,
      createTimeCollectionIdList,
      inputCollectionIdList
    ]);

    return await getAllCollectionIds({
      parentCollectionIds: collectionIds
    });
  } catch {}
};
