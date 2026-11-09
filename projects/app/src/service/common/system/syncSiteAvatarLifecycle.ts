import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import {
  getSiteAvatarRefs,
  type SiteAvatarFields
} from '@fastgpt/service/common/s3/siteAvatarReferences';

/**
 * 站点域保存前后同步 S3 头像资源生命周期。
 * navbarItems 与 favicon 的头像资源受 TTL 管控：
 * - 保留使用的头像需移除 TTL（避免被自动回收）
 * - 彻底失去引用的头像安排延迟删除（避免存储泄漏，也避免 A→B→A 时误删）
 *
 * 计算全量引用集合：
 * 只有在整个站点中（无论是 favicon 还是 navbarItems）彻底不再被引用的图片才安排删除；
 * 新加入整个站点引用的图片才移除 TTL。
 * 延迟删除只写入 TTL，期间重新引用会由 removeAvatarTTL 取消，不直接按旧快照删除对象。
 */
export const syncSiteAvatarLifecycle = async ({
  previous,
  next,
  savedRevision
}: {
  previous: SiteAvatarFields;
  next: SiteAvatarFields;
  /** 本次保存后的站点 revision，用于让延迟回调识别更新的引用。 */
  savedRevision?: number;
}) => {
  const s3AvatarSource = getS3AvatarSource();

  const previousAll = getSiteAvatarRefs(previous);
  const nextAll = getSiteAvatarRefs(next);

  // 1. 新增引用的头像：移除 TTL 避免被定时回收
  for (const avatar of nextAll) {
    if (!previousAll.has(avatar)) {
      await s3AvatarSource.removeAvatarTTL(avatar);
    }
  }

  // 2. 彻底失去所有引用的头像：写延迟删除 TTL，不立即删除对象；
  //    宽限期内重新引用会通过 removeAvatarTTL 取消删除。
  for (const avatar of previousAll) {
    if (!nextAll.has(avatar)) {
      await s3AvatarSource.scheduleAvatarDeletion({ avatar, savedRevision });
    }
  }
};
