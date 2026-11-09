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

/**
 * 读取当前 site 配置中仍被引用的头像 key 集合。
 *
 * 延迟删除 TTL 到期后，清理任务和最终删除任务都要再确认当前配置是否仍引用该图片。
 * 读取失败返回 undefined，调用方应保留对象/延迟本轮删除，等待下一轮重试。
 */
export const getCurrentSiteAvatarKeys = async (): Promise<Set<string> | undefined> => {
  try {
    const doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
    const site = resolveDomainEffectiveConfig('site', doc?.overrides ?? {}, { strict: false });
    const avatars = [site.favicon, ...site.navbarItems.map((item) => item.avatar)].filter(
      Boolean
    ) as string[];

    return new Set(
      avatars
        .filter((avatar) => avatar.startsWith(imageBaseUrl))
        .map((avatar) => avatar.slice(imageBaseUrl.length))
    );
  } catch (error) {
    logger.error('Failed to read current site avatars for S3 TTL cleanup', { error });
    return undefined;
  }
};
