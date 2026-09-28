import type { AppResourceType, AppSchemaType } from '@fastgpt/global/core/app/type';
import { Types } from '../../common/mongo';
import { MongoApp } from './schema';
import { AppVersionCollectionName } from './version/schema';
import { buildAppResourceMongoQuery } from './resources';
import { getFolderDescendantResources } from '../../common/parentFolder/resource';
import type { FolderTreeNode } from '../../common/parentFolder/resource';

type PublishedAppResource = { type: AppResourceType; id: string };
type MatchedPublishedApp = Pick<
  AppSchemaType,
  | '_id'
  | 'parentId'
  | 'avatar'
  | 'type'
  | 'name'
  | 'intro'
  | 'tmbId'
  | 'updateTime'
  | 'inheritPermission'
  | 'publishedVersionId'
> & {
  publishedResources?: PublishedAppResource[];
};

type PublishedResourceGroups = Map<string, PublishedAppResource[]>;
type PublishedResourceIdsByType = Map<AppResourceType, Set<string>>;
type PublishedResourceGroup = {
  id: string;
  isOwner: boolean;
  resources: PublishedAppResource[];
  folderId?: string;
};

/**
 * 查找当前团队发布版本中引用指定资源的 App。
 * 查询条件按资源类型分组；没有有效资源 ID 时不访问 MongoDB。
 */
const findMatchedTeamAppsByPublishedResources = async ({
  teamId,
  resourceIdsByType
}: {
  teamId: string;
  resourceIdsByType: PublishedResourceIdsByType;
}) => {
  const resourceQueries = Array.from(resourceIdsByType).flatMap(([type, resourceIds]) => {
    const ids = Array.from(resourceIds);
    return ids.length > 0
      ? [{ 'published.resources': buildAppResourceMongoQuery({ type, ids }).resources }]
      : [];
  });
  if (resourceQueries.length === 0) return [];

  // Mongo 聚合的 $match 不会执行 Mongoose 查询的自动转型，因此需要显式转换团队 ID。
  const teamObjectId = Types.ObjectId.isValid(teamId) ? new Types.ObjectId(teamId) : teamId;
  return MongoApp.aggregate<MatchedPublishedApp>([
    {
      $match: {
        teamId: teamObjectId,
        deleteTime: null,
        publishedVersionId: { $exists: true, $ne: null }
      }
    },
    {
      $lookup: {
        from: AppVersionCollectionName,
        localField: 'publishedVersionId',
        foreignField: '_id',
        as: 'published'
      }
    },
    { $unwind: { path: '$published' } },
    { $match: { $or: resourceQueries } },
    {
      $project: {
        parentId: 1,
        avatar: 1,
        type: 1,
        name: 1,
        intro: 1,
        tmbId: 1,
        updateTime: 1,
        inheritPermission: 1,
        publishedVersionId: 1,
        publishedResources: '$published.resources'
      }
    }
  ]);
};

/**
 * 反查团队内当前正式发布版本引用指定资源的 App，并按资源 ID 统计唯一 App 数量。
 * 只读取 publishedVersionId 指向的版本，草稿和历史版本不参与统计。
 */
export const findTeamAppsByPublishedResource = async ({
  teamId,
  type,
  ids
}: {
  teamId: string;
  type: AppResourceType;
  ids: string | string[];
}) => {
  const idList = Array.isArray(ids) ? ids : [ids];
  const matched = await findMatchedTeamAppsByPublishedResources({
    teamId,
    resourceIdsByType: new Map([[type, new Set(idList)]])
  });

  const counts = new Map<string, number>();
  matched.forEach((app) => {
    const matchedResourceIds = new Set(
      (app.publishedResources ?? [])
        .filter((resource) => resource.type === type && idList.includes(resource.id))
        .map((resource) => resource.id)
    );
    matchedResourceIds.forEach((resourceId) => {
      counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
    });
  });

  const apps = matched.map(({ publishedResources: _publishedResources, ...app }) => app);

  return { apps, counts };
};

/**
 * 统一展开 Owner 可见资源的文件夹后代，并统计当前发布 App 对每个资源组的引用数。
 * 一个发布 App 在同一资源组内即使引用多个成员，也只计数一次。
 */
export const countTeamAppsByPublishedResourceGroups = async ({
  teamId,
  resourceGroups,
  fetchChildren,
  shouldTraverse,
  getResource
}: {
  teamId: string;
  resourceGroups: PublishedResourceGroup[];
  fetchChildren: (parentIds: string[]) => Promise<FolderTreeNode[]>;
  shouldTraverse: (node: FolderTreeNode) => boolean;
  getResource: (node: FolderTreeNode) => PublishedAppResource | undefined;
}) => {
  const ownerResourceGroups = resourceGroups.filter(({ isOwner }) => isOwner);
  const folderIds = ownerResourceGroups.flatMap(({ folderId }) => (folderId ? [folderId] : []));
  const descendantResourcesByFolder = await getFolderDescendantResources({
    folderIds,
    fetchChildren,
    shouldTraverse,
    isResource: (node) => getResource(node) !== undefined
  });
  const resourceIdsByGroup = new Map<string, PublishedAppResource[]>();

  ownerResourceGroups.forEach(({ id, resources, folderId }) => {
    const descendantResources = folderId
      ? (descendantResourcesByFolder.get(folderId) ?? []).flatMap((node) => {
          const resource = getResource(node);
          return resource ? [resource] : [];
        })
      : [];
    resourceIdsByGroup.set(id, [...resources, ...descendantResources]);
  });

  const getResourceKey = ({ type, id }: PublishedAppResource) => JSON.stringify([type, id]);
  const resourceGroupsByKey = new Map<string, Set<string>>();
  const resourceIdsByType = new Map<AppResourceType, Set<string>>();

  resourceIdsByGroup.forEach((resources, groupId) => {
    resources.forEach((resource) => {
      const resourceKey = getResourceKey(resource);
      const groupIds = resourceGroupsByKey.get(resourceKey) ?? new Set<string>();
      groupIds.add(groupId);
      resourceGroupsByKey.set(resourceKey, groupIds);

      const resourceIds = resourceIdsByType.get(resource.type) ?? new Set<string>();
      resourceIds.add(resource.id);
      resourceIdsByType.set(resource.type, resourceIds);
    });
  });

  const matched = await findMatchedTeamAppsByPublishedResources({ teamId, resourceIdsByType });
  const appIdsByGroup = new Map<string, Set<string>>();
  matched.forEach((app) => {
    const groupsForApp = new Set<string>();
    (app.publishedResources ?? []).forEach((resource) => {
      resourceGroupsByKey
        .get(getResourceKey(resource))
        ?.forEach((groupId) => groupsForApp.add(groupId));
    });
    groupsForApp.forEach((groupId) => {
      const appIds = appIdsByGroup.get(groupId) ?? new Set<string>();
      appIds.add(String(app._id));
      appIdsByGroup.set(groupId, appIds);
    });
  });

  return new Map(
    [...resourceIdsByGroup.keys()].map((groupId) => [
      groupId,
      appIdsByGroup.get(groupId)?.size ?? 0
    ])
  );
};
