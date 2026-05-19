import { Types } from 'mongoose';
import { addMinutes } from 'date-fns';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModelById } from '@fastgpt/service/core/ai/model';
import { sumPer } from '@fastgpt/global/support/permission/utils';

export type GetDatasetListWithChildrenBody = {
  parentId: ParentIdType;
  type?: DatasetTypeEnum;
  searchKey?: string;
  scene?: string;
  pageNum?: number;
  pageSize?: number;
};

export type DatasetListItemWithChildrenType = DatasetListItemType & {
  children?: DatasetListItemType[];
};

type ListWithChildrenResponse =
  | DatasetListItemWithChildrenType[]
  | { list: DatasetListItemWithChildrenType[]; total: number };

async function handler(
  req: ApiRequestProps<GetDatasetListWithChildrenBody>
): Promise<ListWithChildrenResponse> {
  const { parentId, type, searchKey, scene, pageNum, pageSize } = req.body;
  const isPaginated = pageNum !== undefined && pageSize !== undefined;

  if (isPaginated) {
    if (pageNum < 1 || !Number.isInteger(pageNum)) {
      throw new Error('pageNum must be a positive integer');
    }
    if (pageSize < 1 || !Number.isInteger(pageSize)) {
      throw new Error('pageSize must be a positive integer');
    }
  }

  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    ...(parentId
      ? [
          authDataset({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            datasetId: parentId
          })
        ]
      : [])
  ]);

  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);
  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  // Pre-build role index to avoid O(R) scans inside formatDataset
  const rolesByResourceId = new Map<string, typeof myRoles>();
  for (const role of myRoles) {
    const key = String(role.resourceId);
    const list = rolesByResourceId.get(key) ?? [];
    list.push(role);
    rolesByResourceId.set(key, list);
  }
  const clbCountByResourceId = new Map<string, number>();
  for (const role of roleList) {
    const key = String(role.resourceId);
    clbCountByResourceId.set(key, (clbCountByResourceId.get(key) ?? 0) + 1);
  }

  const findDatasetQuery = (() => {
    const idList = { _id: { $in: myRoles.map((item) => item.resourceId) } };
    const datasetPerQuery = teamPer.isOwner
      ? {}
      : parentId
        ? {
            $or: [idList, parseParentIdInMongo(parentId)]
          }
        : { $or: [idList, { parentId: null }] };

    const searchMatch = searchKey
      ? {
          $or: [
            { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } },
            { intro: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }
          ]
        }
      : {};

    if (searchKey) {
      const data = {
        ...datasetPerQuery,
        teamId,
        deleteTime: null,
        ...searchMatch
      };
      // @ts-ignore
      delete data.parentId;
      return data;
    }

    return {
      ...datasetPerQuery,
      teamId,
      deleteTime: null,
      ...(type ? (Array.isArray(type) ? { type: { $in: type } } : { type }) : {}),
      ...parseParentIdInMongo(parentId)
    };
  })();

  const myDatasets = await MongoDataset.find(findDatasetQuery).sort({ updateTime: -1 }).lean();

  const folderDatasetIds = myDatasets
    .filter((d) => d.type === DatasetTypeEnum.folder)
    .map((d) => String(d._id));

  // BFS: collect non-folder descendants grouped by their root folder.
  // Each BFS level fires one DB query for all pending parent IDs.
  type FolderQueueItem = { folderId: string; childId: string };
  const folderChildrenMap = new Map<string, typeof myDatasets>();
  if (folderDatasetIds.length > 0) {
    let queue: FolderQueueItem[] = folderDatasetIds.map((id) => ({ folderId: id, childId: id }));
    for (const id of folderDatasetIds) {
      folderChildrenMap.set(id, []);
    }

    while (queue.length > 0) {
      // Index current queue for O(1) lookup when assigning children to root folders
      const childIdToRootFolders = new Map<string, string[]>();
      for (const q of queue) {
        const list = childIdToRootFolders.get(q.childId) ?? [];
        list.push(q.folderId);
        childIdToRootFolders.set(q.childId, list);
      }

      const children = await MongoDataset.find(
        { parentId: { $in: [...childIdToRootFolders.keys()] }, teamId, deleteTime: null },
        '_id type parentId avatar name intro vectorModelId inheritPermission tmbId updateTime'
      ).lean();

      const nextQueue: FolderQueueItem[] = [];

      for (const child of children) {
        const rootFolderIds = childIdToRootFolders.get(String(child.parentId)) ?? [];
        for (const rootFolderId of rootFolderIds) {
          if (child.type !== DatasetTypeEnum.folder) {
            folderChildrenMap.get(rootFolderId)!.push(child);
          } else {
            // Continue BFS into nested folder
            nextQueue.push({ folderId: rootFolderId, childId: String(child._id) });
          }
        }
      }

      queue = nextQueue;
    }
  }

  // Deduplicate non-folder datasets across top-level results and folder children.
  // Dedup is needed in searchKey mode where top-level results and folder children can overlap.
  const nonFolderDatasetMap = new Map<string, (typeof myDatasets)[0]>();
  for (const d of myDatasets) {
    if (d.type !== DatasetTypeEnum.folder) nonFolderDatasetMap.set(String(d._id), d);
  }
  for (const children of folderChildrenMap.values()) {
    for (const d of children) {
      nonFolderDatasetMap.set(String(d._id), d);
    }
  }
  const uniqueNonFolderDatasets = [...nonFolderDatasetMap.values()];

  let dataCountMap: Map<string, number> | undefined;
  if (scene !== undefined) {
    const dataCounts = await Promise.all(
      uniqueNonFolderDatasets.map((dataset) =>
        MongoDatasetData.countDocuments({
          teamId,
          datasetId: dataset._id,
          q: { $exists: true }
        })
      )
    );
    dataCountMap = new Map<string, number>();
    uniqueNonFolderDatasets.forEach((dataset, index) => {
      dataCountMap!.set(String(dataset._id), dataCounts[index]);
    });
  }

  const appCountMap = new Map<string, number>();
  const fileCountMap = new Map<string, number>();
  const processingCountMap = new Map<string, number>();
  if (uniqueNonFolderDatasets.length > 0) {
    // find() post-hook converts _id to string, so we need to re-wrap for aggregate $in
    const datasetObjectIds = uniqueNonFolderDatasets.map((d) => new Types.ObjectId(d._id));
    const [appCounts, fileCounts, processingAgg] = await Promise.all([
      Promise.all(
        uniqueNonFolderDatasets.map((dataset) =>
          MongoApp.countDocuments({
            teamId,
            modules: {
              $elemMatch: {
                inputs: {
                  $elemMatch: {
                    key: 'datasets',
                    'value.datasetId': String(dataset._id)
                  }
                }
              }
            }
          })
        )
      ),
      Promise.all(
        uniqueNonFolderDatasets.map((dataset) =>
          MongoDatasetCollection.countDocuments({
            datasetId: dataset._id,
            type: { $ne: DatasetCollectionTypeEnum.folder },
            deleteTime: null
          })
        )
      ),
      MongoDatasetTraining.aggregate<{ _id: string; count: number }>([
        { $match: { datasetId: { $in: datasetObjectIds } } },
        {
          $group: {
            _id: { datasetId: '$datasetId', collectionId: '$collectionId' },
            count: { $sum: 1 },
            hasError: {
              $max: { $cond: [{ $ifNull: ['$errorMsg', false] }, true, false] }
            },
            hasActive: { $max: { $gt: ['$lockTime', addMinutes(new Date(), -10)] } },
            allParse: { $min: { $eq: ['$mode', TrainingModeEnum.parse] } }
          }
        },
        {
          $match: {
            count: { $gt: 0 },
            hasError: { $ne: true },
            $or: [{ hasActive: true }, { allParse: { $ne: true } }]
          }
        },
        {
          $group: {
            _id: { $toString: '$_id.datasetId' },
            count: { $sum: 1 }
          }
        }
      ])
    ]);
    uniqueNonFolderDatasets.forEach((dataset, index) => {
      appCountMap.set(String(dataset._id), appCounts[index]);
      fileCountMap.set(String(dataset._id), fileCounts[index]);
    });
    for (const item of processingAgg) {
      processingCountMap.set(item._id, item.count);
    }
  }

  const formatDataset = (dataset: (typeof myDatasets)[0]): DatasetListItemType => {
    const { Per, privateDataset } = (() => {
      const getPer = (datasetId: string) => {
        const roles = rolesByResourceId.get(datasetId) ?? [];
        const tmbRole = roles.find((item) => !!item.tmbId)?.permission;
        const groupAndOrgRole = sumPer(
          ...roles.filter((item) => !!item.groupId || !!item.orgId).map((item) => item.permission)
        );
        return new DatasetPermission({
          role: tmbRole ?? groupAndOrgRole,
          isOwner: String(dataset.tmbId) === String(tmbId) || teamPer.isOwner
        });
      };
      const getClbCount = (datasetId: string) => clbCountByResourceId.get(datasetId) ?? 0;

      if (
        dataset.inheritPermission &&
        dataset.parentId &&
        dataset.type !== DatasetTypeEnum.folder
      ) {
        return {
          Per: getPer(String(dataset.parentId)).addRole(getPer(String(dataset._id)).role),
          privateDataset: getClbCount(String(dataset.parentId)) <= 1
        };
      }
      return {
        Per: getPer(String(dataset._id)),
        privateDataset: getClbCount(String(dataset._id)) <= 1
      };
    })();

    return {
      _id: dataset._id,
      avatar: dataset.avatar,
      name: dataset.name,
      intro: dataset.intro,
      type: dataset.type,
      vectorModel: getEmbeddingModelById(dataset.vectorModelId),
      inheritPermission: dataset.inheritPermission,
      tmbId: dataset.tmbId,
      updateTime: dataset.updateTime,
      permission: Per,
      private: privateDataset,
      ...(scene !== undefined &&
        dataCountMap &&
        dataset.type !== DatasetTypeEnum.folder && {
          dataCount: dataCountMap.get(String(dataset._id)) || 0
        }),
      ...(dataset.type !== DatasetTypeEnum.folder && {
        appCount: appCountMap.get(String(dataset._id)) ?? 0,
        fileCount: fileCountMap.get(String(dataset._id)) ?? 0,
        processingCount: processingCountMap.get(String(dataset._id)) ?? 0
      })
    };
  };

  const formattedTopLevel = myDatasets
    .map(formatDataset)
    .filter((item) => item.permission.hasReadPer);

  const withChildren: DatasetListItemWithChildrenType[] = formattedTopLevel.map((item) => {
    if (item.type !== DatasetTypeEnum.folder) return item;

    const rawChildren = folderChildrenMap.get(String(item._id)) ?? [];
    const formattedChildren = rawChildren
      .map(formatDataset)
      .filter((child) => child.permission.hasReadPer);

    return { ...item, children: formattedChildren };
  });

  const result = await addSourceMember({ list: withChildren });

  if (isPaginated) {
    const total = result.length;
    const start = (pageNum! - 1) * pageSize!;
    const list = result.slice(start, start + pageSize!);
    return { list, total };
  }
  return result;
}

export default NextAPI(handler);
