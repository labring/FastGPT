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
 * 边界处理：
 * - refreshAvatar 在 newAvatar 为空时提前返回，favicon 被清空时需显式删除旧头像；
 *   但旧 favicon 若仍被新的导航项引用则不能删。
 * - 导航项被删除时，若其头像恰好仍是新 favicon，同样不能删。
 */
export const syncSiteAvatarLifecycle = async ({
  previous,
  next
}: {
  previous: SiteAvatarFields;
  next: SiteAvatarFields;
}) => {
  const s3AvatarSource = getS3AvatarSource();

  const previousAvatars = new Set(
    (previous.navbarItems ?? []).map((item) => item.avatar).filter(Boolean) as string[]
  );
  const nextAvatars = new Set(
    (next.navbarItems ?? []).map((item) => item.avatar).filter(Boolean) as string[]
  );

  await s3AvatarSource.refreshAvatar(next.favicon, previous.favicon);

  // favicon 由有值被清空：refreshAvatar 提前返回不会清理旧头像，这里显式删除
  if (!next.favicon && previous.favicon && !nextAvatars.has(previous.favicon)) {
    await s3AvatarSource.deleteAvatar(previous.favicon);
  }

  for (const avatar of nextAvatars) {
    if (!previousAvatars.has(avatar)) {
      await s3AvatarSource.removeAvatarTTL(avatar);
    }
  }
  for (const avatar of previousAvatars) {
    if (!nextAvatars.has(avatar) && avatar !== next.favicon) {
      await s3AvatarSource.deleteAvatar(avatar);
    }
  }
};
