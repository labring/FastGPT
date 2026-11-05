import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';

type SiteAvatarFields = {
  favicon?: string;
  navbarItems?: { avatar?: string }[];
};

/**
 * 站点域保存前后同步 S3 头像资源生命周期。
 * navbarItems 与 favicon 的头像资源受 TTL 管控：
 * - 保留使用的头像需移除 TTL（避免被自动回收）
 * - 被替换或删除的头像需清理（避免存储泄漏）
 *
 * 计算全量引用集合：
 * 只有在整个站点中（无论是 favicon 还是 navbarItems）彻底不再被引用的图片才执行删除；
 * 新加入整个站点引用的图片才移除 TTL。
 * 避免因逐字段判断导致共用图片（如 favicon 与导航项共用同一图）在替换某字段时被误删。
 */
export const syncSiteAvatarLifecycle = async ({
  previous,
  next
}: {
  previous: SiteAvatarFields;
  next: SiteAvatarFields;
}) => {
  const s3AvatarSource = getS3AvatarSource();

  const getReferencedAvatars = (site: SiteAvatarFields): Set<string> => {
    const list = [site.favicon, ...(site.navbarItems ?? []).map((item) => item.avatar)].filter(
      Boolean
    ) as string[];
    return new Set(list);
  };

  const previousAll = getReferencedAvatars(previous);
  const nextAll = getReferencedAvatars(next);

  // 1. 新增引用的头像：移除 TTL 避免被定时回收
  for (const avatar of nextAll) {
    if (!previousAll.has(avatar)) {
      await s3AvatarSource.removeAvatarTTL(avatar);
    }
  }

  // 2. 彻底失去所有引用的头像：删除 S3 对象及 TTL 记录
  for (const avatar of previousAll) {
    if (!nextAll.has(avatar)) {
      await s3AvatarSource.deleteAvatar(avatar);
    }
  }
};
