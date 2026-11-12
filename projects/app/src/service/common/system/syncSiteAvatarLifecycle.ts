import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import {
  getCurrentSiteAvatarKeys,
  toSiteAvatarKey
} from '@fastgpt/service/common/s3/siteAvatarReferences';

type SiteAvatarFields = {
  favicon?: string;
  navbarItems?: { avatar?: string }[];
  sso?: { icon?: string };
};

/**
 * 维护系统配置图片生命周期（site.favicon、site.navbarItems 与 auth.sso.icon）。
 * 先按全部引用去重：新图取消临时 TTL，失去引用的旧图写延迟删除 TTL。
 * 删除前读取最新系统配置，旧保存的异步清理即使晚于新保存执行，也不能删除已被重新引用的图片。
 * 仅处理本服务上传的 avatar/ 图片，外部 URL 与内置图标不参与清理。
 * 调用发生在配置保存后，失败由调用方记录，不把已提交的配置报告为保存失败。
 */
export const syncSiteAvatarLifecycle = async ({
  previous,
  next
}: {
  previous: SiteAvatarFields;
  next: SiteAvatarFields;
}) => {
  const source = getS3AvatarSource();
  const getRefs = (fields: SiteAvatarFields) =>
    new Set(
      [
        fields.favicon,
        ...(fields.navbarItems ?? []).map((item) => item.avatar),
        fields.sso?.icon
      ].filter((avatar): avatar is string => avatar?.startsWith(`${imageBaseUrl}avatar/`) === true)
    );
  const previousRefs = getRefs(previous);
  const nextRefs = getRefs(next);

  // 先确认新图保留，再处理本次快照中失去引用的旧图。
  for (const avatar of nextRefs) {
    if (!previousRefs.has(avatar)) await source.refreshAvatar(avatar);
  }

  const removedRefs = [...previousRefs].filter((avatar) => !nextRefs.has(avatar));
  if (removedRefs.length === 0) return;

  // 以最新配置为准：旧保存的清理晚于新保存执行时，必须跳过新保存重新引用的图片。
  const currentRefs = await getCurrentSiteAvatarKeys();
  if (!currentRefs) {
    throw new Error('Cannot verify current site avatars before scheduling deletion');
  }
  for (const avatar of removedRefs) {
    if (!currentRefs.has(toSiteAvatarKey(avatar))) {
      await source.scheduleAvatarDeletion({ avatar });
    }
  }
};
