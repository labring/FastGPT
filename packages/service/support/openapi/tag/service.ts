import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { OpenApiTagType } from '@fastgpt/global/openapi/support/openapi/tag';
import { Types } from '../../../common/mongo';
import { MongoOpenApi } from '../schema';
import { MongoOpenApiTag, type OpenApiTagSchemaType } from './schema';
import { findOpenApiTagsByIds, findOpenApiTagsByMember } from './entity';

const toStringId = (value: unknown) => String(value || '');

export const normalizeOpenApiTagName = (name: string) => name.trim().toLowerCase();

const serializeOpenApiTag = (tag: OpenApiTagSchemaType): OpenApiTagType => ({
  _id: toStringId(tag._id),
  name: tag.name,
  type: tag.type,
  order: tag.order,
  createTime: tag.createTime,
  updateTime: tag.updateTime,
  ...(tag.keyCount !== undefined && { keyCount: tag.keyCount })
});

/**
 * 兼容旧模块引用的空实现。
 *
 * API Key 标签已取消默认系统标签初始化。保留这个导出是为了避免开发环境热更新或旧分支代码
 * 仍引用该函数时出现模块导出错误；调用它不会创建任何标签。
 */
export async function ensureDefaultOpenApiTags() {
  return;
}

/**
 * 返回当前成员的 API Key 标签列表，可选统计每个标签绑定的 Key 数量。
 */
export async function listOpenApiTags({
  teamId,
  tmbId,
  withKeyCount = false
}: {
  teamId: string;
  tmbId: string;
  withKeyCount?: boolean;
}) {
  const tags = await findOpenApiTagsByMember({ teamId, tmbId });

  if (!withKeyCount) {
    return tags.map(serializeOpenApiTag);
  }

  const tagObjectIds = tags.map((tag) => new Types.ObjectId(toStringId(tag._id)));
  if (tagObjectIds.length === 0) {
    return [];
  }

  const keyCountAgg = await MongoOpenApi.aggregate<{ _id: Types.ObjectId; keyCount: number }>([
    {
      $match: {
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        tagIds: { $in: tagObjectIds }
      }
    },
    { $unwind: '$tagIds' },
    {
      $match: {
        tagIds: { $in: tagObjectIds }
      }
    },
    {
      $group: {
        _id: '$tagIds',
        keyCount: { $sum: 1 }
      }
    }
  ]);
  const keyCountMap = new Map(keyCountAgg.map((item) => [toStringId(item._id), item.keyCount]));

  return tags.map((tag) =>
    serializeOpenApiTag({
      ...tag,
      keyCount: keyCountMap.get(toStringId(tag._id)) ?? 0
    })
  );
}

/**
 * 创建当前成员的自定义 API Key 标签。
 */
export async function createOpenApiTag({
  teamId,
  tmbId,
  name
}: {
  teamId: string;
  tmbId: string;
  name: string;
}) {
  const normalizedName = normalizeOpenApiTagName(name);
  const exists = await MongoOpenApiTag.exists({
    teamId,
    tmbId,
    normalizedName
  });

  if (exists) {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  const firstTag = await MongoOpenApiTag.findOne({
    teamId,
    tmbId
  })
    .sort({ order: 1, createTime: 1, _id: 1 })
    .select('order')
    .lean();

  const [tag] = await MongoOpenApiTag.create([
    {
      teamId,
      tmbId,
      name,
      normalizedName,
      type: 'custom',
      // 新建标签默认放到最前面，避免用户创建后还要滚到底部查找。
      order: (firstTag?.order ?? 10) - 10
    }
  ]);

  return serializeOpenApiTag(tag.toObject());
}

/**
 * 更新当前成员的 API Key 标签。
 *
 * 历史数据里可能存在 type=system 的标签，当前按普通标签处理，允许重命名和排序。
 */
export async function updateOpenApiTag({
  teamId,
  tmbId,
  tagId,
  name,
  order
}: {
  teamId: string;
  tmbId: string;
  tagId: string;
  name?: string;
  order?: number;
}) {
  const tag = await MongoOpenApiTag.findOne({
    _id: tagId,
    teamId,
    tmbId
  }).lean();

  if (!tag) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  const normalizedName = name === undefined ? undefined : normalizeOpenApiTagName(name);

  if (normalizedName) {
    const exists = await MongoOpenApiTag.exists({
      teamId,
      tmbId,
      normalizedName,
      _id: { $ne: tagId }
    });

    if (exists) {
      return Promise.reject(CommonErrEnum.invalidParams);
    }
  }

  await MongoOpenApiTag.updateOne(
    {
      _id: tagId,
      teamId,
      tmbId
    },
    {
      $set: {
        ...(name !== undefined && {
          name,
          normalizedName
        }),
        ...(order !== undefined && { order }),
        updateTime: new Date()
      }
    }
  );
}

/**
 * 删除当前成员的标签，并从当前成员的 API Key 绑定中解绑。
 */
export async function deleteOpenApiTag({
  teamId,
  tmbId,
  tagId
}: {
  teamId: string;
  tmbId: string;
  tagId: string;
}) {
  const tag = await MongoOpenApiTag.findOne({
    _id: tagId,
    teamId,
    tmbId
  }).lean();

  if (!tag) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  await MongoOpenApiTag.deleteOne({ _id: tagId, teamId, tmbId });
  await MongoOpenApi.updateMany(
    {
      teamId,
      tmbId
    },
    {
      $pull: {
        tagIds: new Types.ObjectId(tagId)
      }
    }
  );
}

/**
 * 校验标签归属并返回去重后的标签 ID。
 *
 * API Key 当前按 tmbId 隔离管理，因此标签也必须属于同一个 teamId + tmbId。
 */
export async function validateOpenApiTags({
  teamId,
  tmbId,
  tags
}: {
  teamId: string;
  tmbId: string;
  tags: string[];
}) {
  const uniqueTagIds = Array.from(new Set(tags.map(toStringId))).filter(Boolean);

  if (uniqueTagIds.length === 0) {
    return [];
  }

  const matchedTags = await MongoOpenApiTag.find({
    teamId,
    tmbId,
    _id: { $in: uniqueTagIds }
  })
    .select({ _id: 1 })
    .lean();

  if (matchedTags.length !== uniqueTagIds.length) {
    return Promise.reject(CommonErrEnum.invalidResource);
  }

  return uniqueTagIds;
}

/**
 * 根据标签 ID 批量读取标签，并按 tagId 组织成 Map，供 API Key list 组装返回。
 */
export async function getOpenApiTagMap({
  teamId,
  tmbId,
  tagIds
}: {
  teamId: string;
  tmbId: string;
  tagIds: string[];
}) {
  const uniqueTagIds = Array.from(new Set(tagIds.map(toStringId))).filter(Boolean);
  if (uniqueTagIds.length === 0) {
    return new Map<string, OpenApiTagType>();
  }

  const tags = await findOpenApiTagsByIds({ teamId, tmbId, tagIds: uniqueTagIds });

  return new Map(tags.map((tag) => [toStringId(tag._id), serializeOpenApiTag(tag)]));
}
