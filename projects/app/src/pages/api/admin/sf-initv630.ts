import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { DatasetTypeEnum, DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import {
  PerResourceTypeEnum,
  ManageRoleVal,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import {
  deleteResourceClbs,
  getResourceOwnedClbs,
  getDatasetEffectiveClbs
} from '@fastgpt/service/support/permission/controller';
import {
  syncChildrenPermission,
  replaceResourceClbs
} from '@fastgpt/service/support/permission/inheritPermission';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';

export type ResponseType = {
  message: string;
  stats: {
    teamsProcessed: number;
    datasetsProcessed: number;
    collectionsProcessed: number;
    appsProcessed: number;
    appFoldersSynced: number;
    clbsDeleted: number;
    foldersSynced: number;
  };
};

const MAX_DEPTH = 10;

/**
 * 4.15.0 版本数据初始化脚本
 * 权限继承逻辑重构后的数据迁移：
 * 1. 遍历所有 team
 * 2. 对每个 team，从 parentId=null 的 dataset 开始 DFS：
 *    - 若 dataset 是 folder 且 inheritPermission=true：同步父级权限到自身及子资源
 *    - 若 dataset 非 folder 且 inheritPermission=true：删除自身所有 clbs
 * 3. 对每个 dataset，处理其下所有 collection：
 *    - 从 parentId=null 的 collection 开始 DFS（同 dataset 逻辑）
 * 4. 对每个 team，处理其下所有 app：
 *    - 从 parentId=null 的 app 开始 DFS（同 dataset 逻辑）
 * 5. 限制递归深度（dataset ≤10，collection ≤10，app ≤10）
 * 6. 脚本幂等：可重复运行，不会破坏已正确的数据
 */

async function migrateTeamDatasets({
  teamId,
  stats
}: {
  teamId: string;
  stats: ResponseType['stats'];
}) {
  addLog.info(`[v4.15.0 Migration] Processing team: ${teamId}`);

  // 1. 获取该 team 下所有未删除的 dataset
  const allDatasets = await MongoDataset.find(
    { teamId, deleteTime: null },
    '_id type parentId inheritPermission teamId'
  ).lean();

  const datasetMap = new Map<string, (typeof allDatasets)[number]>();
  const parentChildrenMap = new Map<string, string[]>();

  for (const dataset of allDatasets) {
    const id = String(dataset._id);
    datasetMap.set(id, dataset);
    const parentId = dataset.parentId ? String(dataset.parentId) : 'root';
    if (!parentChildrenMap.has(parentId)) {
      parentChildrenMap.set(parentId, []);
    }
    parentChildrenMap.get(parentId)!.push(id);
  }

  // 2. DFS 处理 dataset 层级
  const processedDatasets = new Set<string>();

  async function processDataset(datasetId: string, depth: number) {
    if (depth > MAX_DEPTH) {
      addLog.warn(
        `[v4.15.0 Migration] Dataset depth exceeded ${MAX_DEPTH}, skipping: ${datasetId}`
      );
      return;
    }
    if (processedDatasets.has(datasetId)) return;
    processedDatasets.add(datasetId);

    const dataset = datasetMap.get(datasetId);
    if (!dataset) return;

    stats.datasetsProcessed++;

    if (dataset.inheritPermission) {
      if (dataset.type === DatasetTypeEnum.folder) {
        // Folder: 同步父级权限到自身及子 folder
        const parentClbs = dataset.parentId
          ? await getResourceOwnedClbs({
              resourceId: String(dataset.parentId),
              resourceType: PerResourceTypeEnum.dataset,
              teamId
            })
          : [];

        const collaborators = parentClbs.map((clb) => {
          if (clb.permission === OwnerRoleVal) {
            return { ...clb, permission: ManageRoleVal };
          }
          return { ...clb };
        });

        await mongoSessionRun(async (session) => {
          // 使用 replaceResourceClbs 替换自身 clbs（保留 owner）
          await replaceResourceClbs({
            resourceType: PerResourceTypeEnum.dataset,
            teamId,
            resourceId: datasetId,
            collaborators,
            session
          });
        });

        stats.foldersSynced++;
      } else {
        // 非 folder 且继承态：删除自身所有直接 clbs
        const ownClbs = await getResourceOwnedClbs({
          resourceId: datasetId,
          resourceType: PerResourceTypeEnum.dataset,
          teamId
        });

        if (ownClbs.length > 0) {
          // 直接删除所有非 owner 的 clbs
          const nonOwnerClbs = ownClbs.filter((clb) => clb.permission !== OwnerRoleVal);

          if (nonOwnerClbs.length > 0) {
            await MongoResourcePermission.deleteMany({
              _id: { $in: nonOwnerClbs.map((clb) => clb._id) }
            });
            stats.clbsDeleted += nonOwnerClbs.length;
          }
        }
      }
    }

    // 递归处理子 dataset
    const children = parentChildrenMap.get(datasetId) || [];
    for (const childId of children) {
      await processDataset(childId, depth + 1);
    }
  }

  // 从根 dataset 开始处理
  const rootDatasets = parentChildrenMap.get('root') || [];
  for (const rootId of rootDatasets) {
    await processDataset(rootId, 1);
  }

  // 3. 处理该 team 下所有 collection
  await migrateTeamCollections({ teamId, stats });

  // 4. 处理该 team 下所有 app
  await migrateTeamApps({ teamId, stats });
}

async function migrateTeamCollections({
  teamId,
  stats
}: {
  teamId: string;
  stats: ResponseType['stats'];
}) {
  // 获取该 team 下所有未删除的 collection
  const allCollections = await MongoDatasetCollection.find(
    { teamId, deleteTime: null },
    '_id type parentId inheritPermission datasetId teamId'
  ).lean();

  const collectionMap = new Map<string, (typeof allCollections)[number]>();
  const parentChildrenMap = new Map<string, string[]>();

  for (const collection of allCollections) {
    const id = String(collection._id);
    collectionMap.set(id, collection);
    const parentId = collection.parentId ? String(collection.parentId) : 'root';
    if (!parentChildrenMap.has(parentId)) {
      parentChildrenMap.set(parentId, []);
    }
    parentChildrenMap.get(parentId)!.push(id);
  }

  const processedCollections = new Set<string>();

  async function processCollection(collectionId: string, depth: number) {
    if (depth > MAX_DEPTH) {
      addLog.warn(
        `[v4.15.0 Migration] Collection depth exceeded ${MAX_DEPTH}, skipping: ${collectionId}`
      );
      return;
    }
    if (processedCollections.has(collectionId)) return;
    processedCollections.add(collectionId);

    const collection = collectionMap.get(collectionId);
    if (!collection) return;

    stats.collectionsProcessed++;

    if (collection.inheritPermission) {
      if (collection.type === DatasetCollectionTypeEnum.folder) {
        // Folder collection: 同步父级权限到自身及子 folder collection
        const parentClbs = collection.parentId
          ? await getResourceOwnedClbs({
              resourceId: String(collection.parentId),
              resourceType: PerResourceTypeEnum.collection,
              teamId
            })
          : await getDatasetEffectiveClbs({
              datasetId: String(collection.datasetId),
              teamId
            });

        const collaborators = parentClbs.map((clb) => {
          if (clb.permission === OwnerRoleVal) {
            return { ...clb, permission: ManageRoleVal };
          }
          return { ...clb };
        });

        await mongoSessionRun(async (session) => {
          // 使用 replaceResourceClbs 替换自身 clbs（保留 owner）
          await replaceResourceClbs({
            resourceType: PerResourceTypeEnum.collection,
            teamId,
            resourceId: collectionId,
            collaborators,
            session
          });
        });

        stats.foldersSynced++;
      } else {
        // 非 folder 且继承态：删除自身所有直接 clbs
        const ownClbs = await getResourceOwnedClbs({
          resourceId: collectionId,
          resourceType: PerResourceTypeEnum.collection,
          teamId
        });

        if (ownClbs.length > 0) {
          // 直接删除所有非 owner 的 clbs
          const nonOwnerClbs = ownClbs.filter((clb) => clb.permission !== OwnerRoleVal);

          if (nonOwnerClbs.length > 0) {
            await MongoResourcePermission.deleteMany({
              _id: { $in: nonOwnerClbs.map((clb) => clb._id) }
            });
            stats.clbsDeleted += nonOwnerClbs.length;
          }
        }
      }
    }

    // 递归处理子 collection
    const children = parentChildrenMap.get(collectionId) || [];
    for (const childId of children) {
      await processCollection(childId, depth + 1);
    }
  }

  // 从根 collection（parentId=null）开始处理
  const rootCollections = parentChildrenMap.get('root') || [];
  for (const rootId of rootCollections) {
    await processCollection(rootId, 1);
  }
}

async function migrateTeamApps({
  teamId,
  stats
}: {
  teamId: string;
  stats: ResponseType['stats'];
}) {
  // 获取该 team 下所有未删除的 app
  const allApps = await MongoApp.find(
    { teamId, deleteTime: null },
    '_id type parentId inheritPermission teamId'
  ).lean();

  const appMap = new Map<string, (typeof allApps)[number]>();
  const parentChildrenMap = new Map<string, string[]>();

  for (const app of allApps) {
    const id = String(app._id);
    appMap.set(id, app);
    const parentId = app.parentId ? String(app.parentId) : 'root';
    if (!parentChildrenMap.has(parentId)) {
      parentChildrenMap.set(parentId, []);
    }
    parentChildrenMap.get(parentId)!.push(id);
  }

  const processedApps = new Set<string>();

  async function processApp(appId: string, depth: number) {
    if (depth > MAX_DEPTH) {
      addLog.warn(`[v4.15.0 Migration] App depth exceeded ${MAX_DEPTH}, skipping: ${appId}`);
      return;
    }
    if (processedApps.has(appId)) return;
    processedApps.add(appId);

    const app = appMap.get(appId);
    if (!app) return;

    stats.appsProcessed++;

    if (app.inheritPermission) {
      if (AppFolderTypeList.includes(app.type)) {
        // Folder: 同步父级权限到自身及子 folder
        const parentClbs = app.parentId
          ? await getResourceOwnedClbs({
              resourceId: String(app.parentId),
              resourceType: PerResourceTypeEnum.app,
              teamId
            })
          : [];

        const collaborators = parentClbs.map((clb) => {
          if (clb.permission === OwnerRoleVal) {
            return { ...clb, permission: ManageRoleVal };
          }
          return { ...clb };
        });

        await mongoSessionRun(async (session) => {
          await replaceResourceClbs({
            resourceType: PerResourceTypeEnum.app,
            teamId,
            resourceId: appId,
            collaborators,
            session
          });
        });

        stats.appFoldersSynced++;
      } else {
        // 非 folder 且继承态：删除自身所有直接 clbs
        const ownClbs = await getResourceOwnedClbs({
          resourceId: appId,
          resourceType: PerResourceTypeEnum.app,
          teamId
        });

        if (ownClbs.length > 0) {
          const nonOwnerClbs = ownClbs.filter((clb) => clb.permission !== OwnerRoleVal);

          if (nonOwnerClbs.length > 0) {
            await MongoResourcePermission.deleteMany({
              _id: { $in: nonOwnerClbs.map((clb) => clb._id) }
            });
            stats.clbsDeleted += nonOwnerClbs.length;
          }
        }
      }
    }

    // 递归处理子 app
    const children = parentChildrenMap.get(appId) || [];
    for (const childId of children) {
      await processApp(childId, depth + 1);
    }
  }

  // 从根 app 开始处理
  const rootApps = parentChildrenMap.get('root') || [];
  for (const rootId of rootApps) {
    await processApp(rootId, 1);
  }
}

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  addLog.info('[v4.15.0 Migration] Starting permission inheritance migration...');

  const stats: ResponseType['stats'] = {
    teamsProcessed: 0,
    datasetsProcessed: 0,
    collectionsProcessed: 0,
    appsProcessed: 0,
    appFoldersSynced: 0,
    clbsDeleted: 0,
    foldersSynced: 0
  };

  // 分批处理 team，避免一次性加载过多
  const BATCH_SIZE = 100;
  let offset = 0;

  while (true) {
    const teams = await MongoTeam.find({}, '_id').skip(offset).limit(BATCH_SIZE).lean();

    if (teams.length === 0) break;

    for (const team of teams) {
      try {
        await migrateTeamDatasets({ teamId: String(team._id), stats });
        stats.teamsProcessed++;
      } catch (error) {
        addLog.error(`[v4.15.0 Migration] Failed to process team ${team._id}:`, error);
        // 继续处理下一个 team，不中断整体迁移
      }
    }

    offset += BATCH_SIZE;
    addLog.info(`[v4.15.0 Migration] Processed ${offset} teams so far`);
  }

  addLog.info('[v4.15.0 Migration] Completed', stats);

  return {
    message: `Completed v4.15.0 permission inheritance migration. Teams: ${stats.teamsProcessed}, Datasets: ${stats.datasetsProcessed}, Collections: ${stats.collectionsProcessed}, Apps: ${stats.appsProcessed}, App folders synced: ${stats.appFoldersSynced}, Clbs deleted: ${stats.clbsDeleted}, Folders synced: ${stats.foldersSynced}`,
    stats
  };
}

export default NextAPI(handler);
