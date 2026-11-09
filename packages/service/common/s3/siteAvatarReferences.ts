import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '../system/systemInstanceConfig/schema';
import { MongoSiteAvatarState } from './models/siteAvatarState';
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
export type CurrentSiteAvatarRefs = {
  avatarKeys: Set<string>;
  revision: number;
};

export const getCurrentSiteAvatarKeys = async (): Promise<CurrentSiteAvatarRefs | undefined> => {
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

    return {
      avatarKeys: new Set(
        avatars
          .filter((avatar) => avatar.startsWith(imageBaseUrl))
          .map((avatar) => avatar.slice(imageBaseUrl.length))
      ),
      revision: doc?.revision ?? 0
    };
  } catch (error) {
    logger.error('Failed to read current site avatars for S3 TTL cleanup', { error });
    return undefined;
  }
};

export type SiteAvatarFields = {
  favicon?: string;
  navbarItems?: { avatar?: string }[];
};

/** 站点头像的删除协调状态；删除任务已领取时，新的引用保存必须失败并重试。 */
export class SiteAvatarDeletionInProgressError extends Error {
  constructor(avatarKey: string) {
    super(`Avatar deletion is in progress: ${avatarKey}`);
    this.name = 'SiteAvatarDeletionInProgressError';
  }
}

/** 提取站点配置中所有头像引用（favicon 与 navbarItems），保持原始 URL 形态。 */
export const getSiteAvatarRefs = (site: SiteAvatarFields): Set<string> => {
  const list = [site.favicon, ...(site.navbarItems ?? []).map((item) => item.avatar)].filter(
    Boolean
  ) as string[];
  return new Set(list);
};

/** 将站点头像 URL 转为对象 key；外部 URL 原样返回，调用方仅在确认属于头像桶后使用。 */
export const toSiteAvatarKey = (avatar: string): string =>
  avatar.startsWith(imageBaseUrl) ? avatar.slice(imageBaseUrl.length) : avatar;

/**
 * 在写入站点配置前登记头像引用。
 *
 * 若删除任务已经领取该对象，返回冲突，调用方必须中止本次保存；这样不会出现
 * 「配置已引用 A，但 A 正被旧删除任务删除」的最终状态。
 */
export const reserveSiteAvatarReferences = async ({
  avatarKeys,
  siteRevision
}: {
  avatarKeys: string[];
  siteRevision: number;
}): Promise<void> => {
  for (const avatarKey of new Set(avatarKeys)) {
    const updated = await MongoSiteAvatarState.updateOne(
      { avatarKey, state: { $ne: 'deleting' } },
      {
        $set: { state: 'referenced', referencedRevision: siteRevision },
        $unset: { deleteClaimedAt: 1 }
      }
    );
    if (updated.matchedCount > 0) continue;

    try {
      await MongoSiteAvatarState.create({
        avatarKey,
        state: 'referenced',
        referencedRevision: siteRevision
      });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      const existing = await MongoSiteAvatarState.findOne({ avatarKey }).lean();
      if (existing?.state === 'deleting') {
        throw new SiteAvatarDeletionInProgressError(avatarKey);
      }
      // 并发登记成 referenced/pending：引用优先级更高，再尝试一次置为 referenced。
      await MongoSiteAvatarState.updateOne(
        { avatarKey, state: { $ne: 'deleting' } },
        {
          $set: { state: 'referenced', referencedRevision: siteRevision },
          $unset: { deleteClaimedAt: 1 }
        }
      );
    }
  }
};

/**
 * 把失去引用的头像标记为待删除。
 * 返回 false 表示已有删除任务领取该对象，本次不重复安排。
 */
export const markSiteAvatarDeletionPending = async ({
  avatarKey,
  savedRevision
}: {
  avatarKey: string;
  /** 保存后的站点 revision；缺省表示清理任务扫描，不得覆盖任何尚未过期的引用。 */
  savedRevision?: number;
}): Promise<boolean> => {
  const existing = await MongoSiteAvatarState.findOne({ avatarKey }).lean();
  if (existing) {
    if (existing.state === 'deleting') return false;
    if (existing.state === 'pending') return true;

    // referenced：只有引用的 revision 不晚于当前保存时才允许降级。
    // 旧保存的延迟回调因此不会覆盖新保存刚登记的引用。
    if (savedRevision === undefined || (existing.referencedRevision ?? 0) > savedRevision) {
      return false;
    }
    const updated = await MongoSiteAvatarState.updateOne(
      {
        _id: existing._id,
        state: 'referenced',
        referencedRevision: existing.referencedRevision
      },
      { $set: { state: 'pending' }, $unset: { deleteClaimedAt: 1 } }
    );
    return updated.modifiedCount > 0;
  }

  try {
    await MongoSiteAvatarState.create({ avatarKey, state: 'pending' });
    return true;
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const current = await MongoSiteAvatarState.findOne({ avatarKey }).lean();
    return current?.state === 'pending';
  }
};

/** 站点重新引用头像时取消待删除状态；删除任务已领取时保持 deleting，由保存入口报冲突。 */
export const markSiteAvatarReferenced = async ({
  avatarKey,
  siteRevision
}: {
  avatarKey: string;
  /** 观察到引用时的站点 revision；旧保存回调不能覆盖它。 */
  siteRevision: number;
}) => {
  await MongoSiteAvatarState.updateOne(
    { avatarKey, state: { $ne: 'deleting' } },
    {
      $set: { state: 'referenced', referencedRevision: siteRevision },
      $unset: { deleteClaimedAt: 1 }
    }
  );
};

export type SiteAvatarDeletionClaim = 'claimed' | 'referenced' | 'deleting';

/**
 * 原子领取头像删除任务。
 * - claimed: 当前任务获得删除权；
 * - referenced: 期间被重新引用，必须跳过；
 * - deleting: 另一个任务已领取，当前任务跳过避免重复删除。
 */
export const claimSiteAvatarDeletion = async ({
  avatarKey
}: {
  avatarKey: string;
}): Promise<SiteAvatarDeletionClaim> => {
  const claimed = await MongoSiteAvatarState.findOneAndUpdate(
    { avatarKey, state: 'pending' },
    { $set: { state: 'deleting', deleteClaimedAt: new Date() } },
    { new: true }
  ).lean();
  if (claimed) return 'claimed';

  let existing = await MongoSiteAvatarState.findOne({ avatarKey }).lean();
  // 兼容没有状态文档的历史 TTL/删除任务：先补一个 pending，再按正常流程领取。
  if (!existing) {
    await markSiteAvatarDeletionPending({ avatarKey });
    const claimedLegacy = await MongoSiteAvatarState.findOneAndUpdate(
      { avatarKey, state: 'pending' },
      { $set: { state: 'deleting', deleteClaimedAt: new Date() } },
      { new: true }
    ).lean();
    if (claimedLegacy) return 'claimed';
    existing = await MongoSiteAvatarState.findOne({ avatarKey }).lean();
  }

  return existing?.state === 'referenced' ? 'referenced' : 'deleting';
};

/** 删除成功或确认对象已不存在后清理状态文档。 */
export const clearSiteAvatarDeletionState = async ({ avatarKey }: { avatarKey: string }) => {
  await MongoSiteAvatarState.deleteOne({ avatarKey });
};

/** 删除失败时释放领取，交给下一次任务重试。 */
export const releaseSiteAvatarDeletion = async ({ avatarKey }: { avatarKey: string }) => {
  await MongoSiteAvatarState.updateOne(
    { avatarKey, state: 'deleting' },
    { $set: { state: 'pending' }, $unset: { deleteClaimedAt: 1 } }
  );
};
