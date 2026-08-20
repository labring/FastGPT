import type { AppResourceType } from '@fastgpt/global/core/app/type';
import { Types } from '../../common/mongo';
import { MongoApp } from './schema';
import { AppVersionCollectionName } from './version/schema';
import { buildAppResourceMongoQuery } from './resources';

type PublishedAppResource = { type: AppResourceType; id: string };
type PublishedAppDoc = {
  _id: unknown;
  publishedVersionId?: unknown;
  publishedResources?: PublishedAppResource[];
} & Record<string, unknown>;

/**
 * 按当前正式 Version 反查引用了指定资源的团队 App。
 * 只查已有 publishedVersionId 的 App；4161 会给非文件夹 App 补齐该指针。
 * 通过 $lookup 把资源匹配下推到 Mongo，只返回命中的 App，避免全团队 App 入内存。
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
  // 调用方以空格分隔的投影字符串传字段名，如 'parentId avatar type'，这里拆成数组供 $project 使用。
  const projectFields = projection ? projection.trim().split(/\s+/).filter(Boolean) : [];
  const resourceQuery = buildAppResourceMongoQuery({ type, ids: idList }).resources;
  // 聚合 $match 不做 mongoose 的 find 式自动转型，团队 id 需显式转 ObjectId。
  const teamObjectId = Types.ObjectId.isValid(teamId) ? new Types.ObjectId(teamId) : teamId;

  const matched = await MongoApp.aggregate<PublishedAppDoc>([
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
        publishedVersionId: 1,
        ...Object.fromEntries(projectFields.map((key) => [key, 1])),
        publishedResources: '$published.resources'
      }
    }
  ]);

  const apps = matched.map(({ publishedResources, ...app }) => app);

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

  return { apps, counts };
};
