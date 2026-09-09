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

/**
 * 按当前正式 Version 反查引用了指定资源的团队 App。
 * 只查已有 publishedVersionId 的 App；4163 会给非文件夹 App 补齐该指针。
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
  const resourceQuery = buildAppResourceMongoQuery({ type, ids: idList }).resources;
  // 聚合 $match 不做 mongoose 的 find 式自动转型，团队 id 需显式转 ObjectId。
  const teamObjectId = Types.ObjectId.isValid(teamId) ? new Types.ObjectId(teamId) : teamId;

  const matched = await MongoApp.aggregate<MatchedPublishedApp>([
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
    { $match: { 'published.resources': resourceQuery } },
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
