import type {
  AppResourceType,
  AppResourcesType,
  AppSchemaType
} from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { Types } from '../../common/mongo';
import { MongoApp } from './schema';
import { AppVersionCollectionName } from './version/schema';
import { buildAppResourceMongoQuery, resolveStoredAppResources } from './resource/utils';
import { AppTypeEnum, AppTypeList, ToolTypeList } from '@fastgpt/global/core/app/constants';

type AppResourceRef = { type: AppResourceType; id: string };
type VersionResourceProjection = Pick<
  AppVersionSchemaType,
  'resources' | 'nodes' | 'chatConfig'
> & {
  resourceRefs?: unknown;
};
type MatchedApp = Pick<
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
  draftResources?: AppResourcesType;
  draftNodes?: VersionResourceProjection['nodes'];
  draftChatConfig?: VersionResourceProjection['chatConfig'];
  draftResourceRefs?: unknown;
  publishedResources?: AppResourcesType;
  publishedNodes?: VersionResourceProjection['nodes'];
  publishedChatConfig?: VersionResourceProjection['chatConfig'];
  publishedResourceRefs?: unknown;
};

type ResourceGroups = Map<string, AppResourceRef[]>;
type ResourceIdsByType = Map<AppResourceType, Set<string>>;
type ResourceGroup = {
  id: string;
  isOwner: boolean;
  resources: AppResourceRef[];
};

/** Map an App type to the resource kind persisted in App resources. */
export const getAppPublishedResourceType = (type: string): 'agent' | 'tool' | undefined => {
  if (type === AppTypeEnum.tool || ToolTypeList.some((toolType) => toolType === type)) {
    return 'tool';
  }
  if (AppTypeList.some((appType) => appType === type)) return 'agent';
  return undefined;
};
/**
 * 查找当前团队中当前保存版本或当前发布版本引用指定资源的 App。
 * 查询条件按资源类型分组；没有有效资源 ID 时不访问 MongoDB。
 */
const findMatchedTeamAppsByResources = async ({
  teamId,
  resourceIdsByType,
  includeAppsWithoutSnapshots = false
}: {
  teamId: string;
  resourceIdsByType: ResourceIdsByType;
  includeAppsWithoutSnapshots?: boolean;
}) => {
  const resourceQueries = Array.from(resourceIdsByType).flatMap(([type, resourceIds]) => {
    const ids = Array.from(resourceIds);
    return ids.length > 0 ? [buildAppResourceMongoQuery({ type, ids }).resources] : [];
  });
  if (resourceQueries.length === 0) return [];

  // Mongo 聚合的 $match 不会执行 Mongoose 查询的自动转型，因此需要显式转换团队 ID。
  const teamObjectId = Types.ObjectId.isValid(teamId) ? new Types.ObjectId(teamId) : teamId;
  const snapshotFallbackQueries = includeAppsWithoutSnapshots
    ? [
        { 'draftVersion.resources': { $exists: false } },
        { 'publishedVersion.resources': { $exists: false } }
      ]
    : [];

  const matched = await MongoApp.aggregate<MatchedApp>([
    {
      $match: {
        teamId: teamObjectId,
        deleteTime: null
      }
    },
    {
      $lookup: {
        from: AppVersionCollectionName,
        let: { appId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$appId', '$$appId'] } } },
          { $sort: { time: -1, _id: -1 } },
          { $limit: 1 },
          {
            $project: {
              resources: 1,
              nodes: 1,
              chatConfig: 1,
              resourceRefs: 1
            }
          }
        ],
        as: 'draft'
      }
    },
    {
      $lookup: {
        from: AppVersionCollectionName,
        let: {
          appId: '$_id',
          publishedVersionId: '$publishedVersionId'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$_id', '$$publishedVersionId'] }, { $eq: ['$appId', '$$appId'] }]
              }
            }
          },
          {
            $project: {
              resources: 1,
              nodes: 1,
              chatConfig: 1,
              resourceRefs: 1
            }
          }
        ],
        as: 'publishedByPointer'
      }
    },
    {
      $lookup: {
        from: AppVersionCollectionName,
        let: { appId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$appId', '$$appId'] },
              isPublish: true
            }
          },
          { $sort: { time: -1, _id: -1 } },
          { $limit: 1 },
          {
            $project: {
              resources: 1,
              nodes: 1,
              chatConfig: 1,
              resourceRefs: 1
            }
          }
        ],
        as: 'publishedByFlag'
      }
    },
    {
      $set: {
        draftVersion: { $arrayElemAt: ['$draft', 0] },
        publishedVersion: {
          $cond: [
            { $gt: [{ $size: '$publishedByPointer' }, 0] },
            { $arrayElemAt: ['$publishedByPointer', 0] },
            { $arrayElemAt: ['$publishedByFlag', 0] }
          ]
        }
      }
    },
    {
      $match: {
        $or: [
          ...resourceQueries.flatMap((query) => [
            { 'draftVersion.resources': query },
            { 'publishedVersion.resources': query }
          ]),
          ...snapshotFallbackQueries
        ]
      }
    },
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
        draftResources: '$draftVersion.resources',
        draftNodes: '$draftVersion.nodes',
        draftChatConfig: '$draftVersion.chatConfig',
        draftResourceRefs: '$draftVersion.resourceRefs',
        publishedResources: '$publishedVersion.resources',
        publishedNodes: '$publishedVersion.nodes',
        publishedChatConfig: '$publishedVersion.chatConfig',
        publishedResourceRefs: '$publishedVersion.resourceRefs'
      }
    }
  ]);

  return matched;
};

const getVersionResources = ({
  resources,
  nodes,
  chatConfig,
  resourceRefs
}: {
  resources?: AppResourcesType;
  nodes?: VersionResourceProjection['nodes'];
  chatConfig?: VersionResourceProjection['chatConfig'];
  resourceRefs?: unknown;
}): AppResourcesType => resolveStoredAppResources({ resources, nodes, chatConfig, resourceRefs });

const getMatchedResourceIds = ({
  app,
  type,
  ids
}: {
  app: MatchedApp;
  type: AppResourceType;
  ids: Set<string>;
}) => {
  const resources = new Map<string, AppResourceRef>();
  [
    getVersionResources({
      resources: app.draftResources,
      nodes: app.draftNodes,
      chatConfig: app.draftChatConfig,
      resourceRefs: app.draftResourceRefs
    }),
    getVersionResources({
      resources: app.publishedResources,
      nodes: app.publishedNodes,
      chatConfig: app.publishedChatConfig,
      resourceRefs: app.publishedResourceRefs
    })
  ]
    .flat()
    .filter((resource) => resource.type === type && ids.has(resource.id))
    .forEach((resource) => resources.set(`${resource.type}:${resource.id}`, resource));

  return resources;
};

/**
 * 反查团队内当前保存版本或当前发布版本引用指定资源的 App，并按资源 ID 统计唯一 App 数量。
 * 同一个 App 在两个版本中都引用资源时只计数一次。
 */
export const findTeamAppsByResource = async ({
  teamId,
  type,
  ids
}: {
  teamId: string;
  type: AppResourceType;
  ids: string | string[];
}) => {
  const idList = Array.isArray(ids) ? ids : [ids];
  const idSet = new Set(idList);
  const matched = await findMatchedTeamAppsByResources({
    teamId,
    resourceIdsByType: new Map([[type, idSet]]),
    includeAppsWithoutSnapshots: true
  });

  const counts = new Map<string, number>();
  const apps: MatchedApp[] = [];
  matched.forEach((app) => {
    const matchedResources = getMatchedResourceIds({ app, type, ids: idSet });
    if (matchedResources.size === 0) return;
    matchedResources.forEach(({ id: resourceId }) => {
      counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
    });
    apps.push(app);
  });

  const formattedApps = apps.map(
    ({
      draftResources: _draftResources,
      draftNodes: _draftNodes,
      draftChatConfig: _draftChatConfig,
      draftResourceRefs: _draftResourceRefs,
      publishedResources: _publishedResources,
      publishedNodes: _publishedNodes,
      publishedChatConfig: _publishedChatConfig,
      publishedResourceRefs: _publishedResourceRefs,
      ...app
    }) => app
  );

  return { apps: formattedApps, counts };
};

/** 按 Owner 资源组的直接资源统计唯一 App 数量；空资源组不生成计数，文件夹因此无计数字段。 */
export const countTeamAppsByResourceGroups = async ({
  teamId,
  resourceGroups
}: {
  teamId: string;
  resourceGroups: ResourceGroup[];
}) => {
  const ownerResourceGroups = resourceGroups.filter(
    ({ isOwner, resources }) => isOwner && resources.length > 0
  );
  const resourceIdsByGroup = new Map<string, AppResourceRef[]>();

  ownerResourceGroups.forEach(({ id, resources }) => {
    resourceIdsByGroup.set(id, resources);
  });
  const getResourceKey = ({ type, id }: AppResourceRef) => JSON.stringify([type, id]);
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

  const matched = await findMatchedTeamAppsByResources({
    teamId,
    resourceIdsByType,
    includeAppsWithoutSnapshots: true
  });
  const appIdsByGroup = new Map<string, Set<string>>();
  matched.forEach((app) => {
    const groupsForApp = new Set<string>();
    const resources = [
      ...getVersionResources({
        resources: app.draftResources,
        nodes: app.draftNodes,
        chatConfig: app.draftChatConfig,
        resourceRefs: app.draftResourceRefs
      }),
      ...getVersionResources({
        resources: app.publishedResources,
        nodes: app.publishedNodes,
        chatConfig: app.publishedChatConfig,
        resourceRefs: app.publishedResourceRefs
      })
    ];
    resources.forEach((resource) => {
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

/** @deprecated Use findTeamAppsByResource. */
export const findTeamAppsByPublishedResource = findTeamAppsByResource;

/** @deprecated Use countTeamAppsByResourceGroups. */
export const countTeamAppsByPublishedResourceGroups = countTeamAppsByResourceGroups;
