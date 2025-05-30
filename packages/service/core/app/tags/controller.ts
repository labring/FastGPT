import { MongoTag } from './schema';
import { MongoApp } from '../schema';
import { Types } from '../../../common/mongo';

/**
 * 创建新标签
 */
export const createTag = async ({
  teamId,
  name,
  color
}: {
  teamId: string;
  name: string;
  color?: string;
}) => {
  const tag = await MongoTag.create({
    teamId,
    name,
    color
  });

  return tag.toObject();
};

/**
 * 获取团队所有标签
 */
export const getTeamTags = async (teamId: string) => {
  const tags = await MongoTag.find({ teamId }).lean();
  return tags;
};

/**
 * 获取标签使用统计
 */
export const getTagsWithCount = async (teamId: string) => {
  return MongoTag.aggregate([
    { $match: { teamId: new Types.ObjectId(teamId) } },
    {
      $lookup: {
        from: 'apps',
        localField: '_id',
        foreignField: 'tags',
        as: 'apps'
      }
    },
    {
      $addFields: {
        count: { $size: '$apps' }
      }
    },
    {
      $project: {
        apps: 0
      }
    }
  ]);
};

/**
 * 更新标签
 */
export const updateTag = async ({
  tagId,
  teamId,
  name,
  color
}: {
  tagId: string;
  teamId: string;
  name?: string;
  color?: string;
}) => {
  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (color !== undefined) updateData.color = color;

  await MongoTag.updateOne({ _id: tagId, teamId }, { $set: updateData });

  return MongoTag.findById(tagId).lean();
};

/**
 * 删除标签
 */
export const deleteTag = async ({ tagId, teamId }: { tagId: string; teamId: string }) => {
  // 先从所有 app 中移除该标签
  await MongoApp.updateMany({ teamId, tags: tagId }, { $pull: { tags: tagId } });

  // 然后删除标签
  await MongoTag.deleteOne({ _id: tagId, teamId });

  return true;
};

/**
 * 为 app 添加标签
 */
export const addTagToApp = async ({
  appId,
  tagId,
  teamId
}: {
  appId: string;
  tagId: string;
  teamId: string;
}) => {
  // 确认标签存在且属于该团队
  const tag = await MongoTag.findOne({ _id: tagId, teamId });
  if (!tag) {
    throw new Error('Tag not found or not authorized');
  }

  await MongoApp.updateOne({ _id: appId, teamId }, { $addToSet: { tags: tagId } });

  return true;
};

/**
 * 从 app 移除标签
 */
export const removeTagFromApp = async ({
  appId,
  tagId,
  teamId
}: {
  appId: string;
  tagId: string;
  teamId: string;
}) => {
  await MongoApp.updateOne({ _id: appId, teamId }, { $pull: { tags: tagId } });

  return true;
};

/**
 * 批量删除标签
 */
export const batchDeleteTags = async ({ tagIds, teamId }: { tagIds: string[]; teamId: string }) => {
  if (!tagIds || tagIds.length === 0) {
    return true;
  }

  // 先从所有 app 中移除这些标签
  await MongoApp.updateMany(
    { teamId, tags: { $in: tagIds } },
    { $pull: { tags: { $in: tagIds } } }
  );

  // 然后删除标签
  const result = await MongoTag.deleteMany({ _id: { $in: tagIds }, teamId });

  return { deletedCount: result.deletedCount };
};

/**
 * 批量为 app 添加标签
 */
export const batchAddTagsToApp = async ({
  appId,
  tagIds,
  teamId
}: {
  appId: string;
  tagIds: string[];
  teamId: string;
}) => {
  if (!tagIds || tagIds.length === 0) {
    return true;
  }

  // 确认标签存在且属于该团队
  const tags = await MongoTag.find({ _id: { $in: tagIds }, teamId });
  if (tags.length !== tagIds.length) {
    throw new Error('Some tags not found or not authorized');
  }

  await MongoApp.updateOne({ _id: appId, teamId }, { $addToSet: { tags: { $each: tagIds } } });

  return true;
};

/**
 * 批量从 app 移除标签
 */
export const batchRemoveTagsFromApp = async ({
  appId,
  tagIds,
  teamId
}: {
  appId: string;
  tagIds: string[];
  teamId: string;
}) => {
  if (!tagIds || tagIds.length === 0) {
    return true;
  }

  await MongoApp.updateOne({ _id: appId, teamId }, { $pull: { tags: { $in: tagIds } } });

  return true;
};

/**
 * 批量为某一标签添加 app（全量更新）
 */
export const batchAddAppsToTag = async ({
  tagId,
  appIds,
  teamId
}: {
  tagId: string;
  appIds: string[];
  teamId: string;
}) => {
  // 确认标签存在且属于该团队
  const tag = await MongoTag.findOne({ _id: tagId, teamId });
  if (!tag) {
    throw new Error('Tag not found or not authorized');
  }

  // 如果 appIds 为空数组，则移除该标签的所有应用
  if (!appIds || appIds.length === 0) {
    await MongoApp.updateMany({ teamId, tags: tagId }, { $pull: { tags: tagId } });
    return true;
  }

  // 确认所有 app 都存在且属于该团队
  const apps = await MongoApp.find({ _id: { $in: appIds }, teamId });
  if (apps.length !== appIds.length) {
    throw new Error('Some apps not found or not authorized');
  }

  // 先从所有应用中移除该标签
  await MongoApp.updateMany({ teamId, tags: tagId }, { $pull: { tags: tagId } });

  // 然后为指定的应用添加该标签
  await MongoApp.updateMany({ _id: { $in: appIds }, teamId }, { $addToSet: { tags: tagId } });

  return true;
};
