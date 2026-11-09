import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';

type SiteAvatarFields = {
  favicon?: string;
  navbarItems?: { avatar?: string }[];
};

/**
 * 复用应用头像的 refreshAvatar 流程维护站点图片。
 * 先按 favicon 与导航项的全部引用去重：新图取消临时 TTL，彻底失去引用的旧图删除。
 * 仅处理本服务上传的 avatar/ 图片，外部 URL 与内置图标不参与清理。
 * 同一图片只移动位置或仍被其他站点字段共用时不删除；null 明确表示只清理旧图。
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
  const getRefs = (site: SiteAvatarFields) =>
    new Set(
      [site.favicon, ...(site.navbarItems ?? []).map((item) => item.avatar)].filter(
        (avatar): avatar is string => avatar?.startsWith(`${imageBaseUrl}avatar/`) === true
      )
    );
  const previousRefs = getRefs(previous);
  const nextRefs = getRefs(next);

  // 先确认新图保留，再移除已没有任何站点引用的旧图。
  for (const avatar of nextRefs) {
    if (!previousRefs.has(avatar)) await source.refreshAvatar(avatar);
  }
  for (const avatar of previousRefs) {
    if (!nextRefs.has(avatar)) await source.refreshAvatar(null, avatar);
  }
};
