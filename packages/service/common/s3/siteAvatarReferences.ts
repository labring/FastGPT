import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '../system/systemInstanceConfig/schema';
import { getLogger, LogCategories } from '../logger';
import { S3Buckets } from './config/constants';
import { S3Sources } from './contracts/type';

const logger = getLogger(LogCategories.INFRA.S3);
export const AVATAR_KEY_PREFIX = `${S3Sources.avatar}/`;

/** 判断一个 S3 对象是否属于站点头像（头像只存公共 bucket 的 avatar/ 前缀）。 */
export const isSiteAvatarObject = (bucketName: string, key: string): boolean =>
  bucketName === S3Buckets.public && key.startsWith(AVATAR_KEY_PREFIX);

/** 将站点头像 URL 转为对象 key；外部 URL 原样返回，调用方仅在确认属于头像桶后使用。 */
export const toSiteAvatarKey = (avatar: string): string =>
  avatar.startsWith(imageBaseUrl) ? avatar.slice(imageBaseUrl.length) : avatar;

/**
 * 读取当前站点配置中仍被引用的头像 key 集合。
 *
 * 头像清理不能再仅依赖某次保存时的 previous/next 快照：旧保存的后台清理可能在新保存
 * 重新引用图片之后才恢复执行。删除前读取最新配置，可避免按过期快照执行破坏性删除。
 * 读取失败返回 undefined，调用方应保留对象/TTL 并等待下一轮重试。
 */
export const getCurrentSiteAvatarKeys = async (): Promise<Set<string> | undefined> => {
  try {
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    const site = resolveDomainEffectiveConfig({
      domain: 'site',
      overrides: doc?.overrides ?? {},
      options: { strict: false }
    });
    const avatars = [site.favicon, ...site.navbarItems.map((item) => item.avatar)].filter(
      Boolean
    ) as string[];

    return new Set(
      avatars
        .filter((avatar) => avatar.startsWith(imageBaseUrl))
        .map((avatar) => avatar.slice(imageBaseUrl.length))
    );
  } catch (error) {
    logger.error('Failed to read current site avatars for S3 cleanup', { error });
    return undefined;
  }
};
