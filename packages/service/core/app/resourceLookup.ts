import type { AppResourceType, AppSchemaType } from '@fastgpt/global/core/app/type';
import { Types } from '../../common/mongo';
import { MongoApp } from './schema';
import { AppVersionCollectionName } from './version/schema';
import { buildAppResourceMongoQuery } from './resources';

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

  // 聚合 $match 不做 mongoose 的 find 式自动转型，团队 id 需显式转 ObjectId。
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
 * 按当前正式 Version 反查引用了指定资源的团队 App。
 * 只查已有 publishedVersionId 的 App；4171 会给非文件夹 App 补齐该指针。
 * 通过 $lookup 把资源匹配下推到 Mongo，并一次返回固定的最小 App 字段与资源计数。
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
 * Count unique published Apps per UI resource. A group may contain different
 * resource types; an App referencing more than one member still counts once.
 */
export const countTeamAppsByPublishedResourceGroups = async ({
  teamId,
  resourceIdsByGroup
}: {
  teamId: string;
  resourceIdsByGroup: PublishedResourceGroups;
}) => {
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
