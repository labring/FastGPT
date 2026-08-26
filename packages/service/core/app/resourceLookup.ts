import type { AppResourceType } from '@fastgpt/global/core/app/type';
import { Types } from '../../common/mongo';
import { MongoApp } from './schema';
import { AppVersionCollectionName } from './version/schema';
import { buildAppResourceMongoQuery } from './resources';

type PublishedAppResource = { type: AppResourceType; id: string };
type MatchedPublishedApp = {
  _id: unknown;
  publishedResources?: PublishedAppResource[];
};

/**
 * 按当前正式 Version 反查引用了指定资源的团队 App。
 * 只查已有 publishedVersionId 的 App；4163 会给非文件夹 App 补齐该指针。
 * 先通过 $lookup 把资源匹配下推到 Mongo 拿到命中的 App id，再按 id 投影加载，
 * 避免全团队 App 入内存，同时保留 find 的投影类型推断。
 */
export const findTeamAppsByPublishedResource = async ({
  teamId,
  type,
  ids,
  projection
}: {
  teamId: string;
  type: AppResourceType;
  ids: string | string[];
  projection?: string;
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
    { $project: { publishedResources: '$published.resources' } }
  ]);

  const appIds: string[] = [];
  const counts = new Map<string, number>();
  matched.forEach((app) => {
    appIds.push(String(app._id));
    const matchedResourceIds = new Set(
      (app.publishedResources ?? [])
        .filter((resource) => resource.type === type && idList.includes(resource.id))
        .map((resource) => resource.id)
    );
    matchedResourceIds.forEach((resourceId) => {
      counts.set(resourceId, (counts.get(resourceId) ?? 0) + 1);
    });
  });

  const apps =
    appIds.length > 0
      ? await MongoApp.find(
          { _id: { $in: appIds } },
          `_id publishedVersionId ${projection ?? ''}`
        ).lean()
      : [];

  return { apps, counts };
};
