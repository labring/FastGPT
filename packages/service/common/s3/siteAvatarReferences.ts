import type { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
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

export type CurrentSiteAvatarRefs = {
  avatarKeys: Set<string>;
  revision: number;
};

/**
 * 读取当前 site 配置中仍被引用的头像 key 集合。
 *
 * 延迟删除 TTL 到期后，清理任务和最终删除任务都要再确认当前配置是否仍引用该图片。
 * 读取失败返回 undefined，调用方应保留对象/延迟本轮删除，等待下一轮重试。
 */
export const getCurrentSiteAvatarKeys = async ({
  session
}: {
  session?: ClientSession;
} = {}): Promise<CurrentSiteAvatarRefs | undefined> => {
  try {
    const query = MongoSystemInstanceConfig.findOne({ domain: 'site' });
    if (session) query.session(session);
    const doc = await query.lean();
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

const findSiteAvatarState = async ({
  avatarKey,
  session
}: {
  avatarKey: string;
  session?: ClientSession;
}) => {
  const query = MongoSiteAvatarState.findOne({ avatarKey });
  if (session) query.session(session);
  return query.lean();
};

/**
 * 在写入站点配置前登记头像引用。
 *
 * 必须等到条件写真正命中（或创建成功）才算取得保护；补偿写入 0 命中时继续重试，
 * 直到看到 deleting 返回冲突。这样删除 Worker 在读取与补偿之间领取 pending 时，
 * 保存不会误以为自己已经持有引用保护。
 *
 * reservationId 用于保存失败后的所有权释放：只撤销本次请求仍然拥有的 referenced 状态。
 */
export const reserveSiteAvatarReferences = async ({
  avatarKeys,
  siteRevision,
  reservationId = randomUUID(),
  session
}: {
  avatarKeys: string[];
  siteRevision: number;
  reservationId?: string;
  session?: ClientSession;
}): Promise<void> => {
  for (const avatarKey of new Set(avatarKeys)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const updated = await MongoSiteAvatarState.updateOne(
        { avatarKey, state: { $ne: 'deleting' } },
        {
          $set: { state: 'referenced', referencedRevision: siteRevision, reservationId },
          $unset: { deleteClaimedAt: 1, deleteClaimedBy: 1 }
        },
        { session }
      );
      if (updated.matchedCount > 0) break;

      try {
        await new MongoSiteAvatarState({
          avatarKey,
          state: 'referenced',
          referencedRevision: siteRevision,
          reservationId
        }).save({ session });
        break;
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
        const existing = await findSiteAvatarState({ avatarKey, session });
        if (existing?.state === 'deleting') {
          throw new SiteAvatarDeletionInProgressError(avatarKey);
        }
        // 并发登记成 referenced/pending：引用优先级更高，重试条件写；
        // 若第三次仍未命中，按未取得保护处理，由调用方返回冲突。
        if (attempt === 2) {
          throw new SiteAvatarDeletionInProgressError(avatarKey);
        }
      }
    }
  }
};

/**
 * 保存失败时释放本次预登记。
 * 只删除 reservationId 仍匹配的 referenced 状态，不覆盖其他并发请求刚登记的引用。
 */
export const releaseSiteAvatarReservations = async ({
  avatarKeys,
  reservationId,
  session
}: {
  avatarKeys: string[];
  reservationId: string;
  session?: ClientSession;
}): Promise<void> => {
  await MongoSiteAvatarState.deleteMany(
    {
      avatarKey: { $in: avatarKeys },
      state: 'referenced',
      reservationId
    },
    { session }
  );
};

/**
 * 把失去引用的头像标记为待删除。
 * 返回 false 表示已有删除任务领取该对象，或仍存在不应覆盖的引用。
 */
export const markSiteAvatarDeletionPending = async ({
  avatarKey,
  savedRevision,
  session
}: {
  avatarKey: string;
  /** 保存后的站点 revision；缺省表示清理任务扫描，不得覆盖任何尚未过期的引用。 */
  savedRevision?: number;
  session?: ClientSession;
}): Promise<boolean> => {
  const existing = await findSiteAvatarState({ avatarKey, session });
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
      {
        $set: { state: 'pending' },
        $unset: { deleteClaimedAt: 1, deleteClaimedBy: 1, reservationId: 1 }
      },
      { session }
    );
    return updated.modifiedCount > 0;
  }

  try {
    await new MongoSiteAvatarState({ avatarKey, state: 'pending' }).save({ session });
    return true;
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const current = await findSiteAvatarState({ avatarKey, session });
    return current?.state === 'pending';
  }
};

/** 站点重新引用头像时取消待删除状态；删除任务已领取时保持 deleting，由保存入口报冲突。 */
export const markSiteAvatarReferenced = async ({
  avatarKey,
  siteRevision,
  session
}: {
  avatarKey: string;
  /** 观察到引用时的站点 revision；旧保存回调不能覆盖它。 */
  siteRevision: number;
  session?: ClientSession;
}) => {
  await MongoSiteAvatarState.updateOne(
    { avatarKey, state: { $ne: 'deleting' } },
    {
      $set: { state: 'referenced', referencedRevision: siteRevision },
      $unset: { deleteClaimedAt: 1, deleteClaimedBy: 1, reservationId: 1 }
    },
    { session }
  );
};

export type SiteAvatarDeletionClaim = 'claimed' | 'referenced' | 'deleting';

/**
 * 原子领取头像删除任务。
 * claimId 对应 BullMQ job id：同一任务重试时能恢复自己持有的 deleting，
 * 其他任务看到 deleting 则跳过，避免重复删除。
 */
export const claimSiteAvatarDeletion = async ({
  avatarKey,
  claimId,
  session
}: {
  avatarKey: string;
  claimId: string;
  session?: ClientSession;
}): Promise<SiteAvatarDeletionClaim> => {
  const claimed = await MongoSiteAvatarState.findOneAndUpdate(
    { avatarKey, state: 'pending' },
    {
      $set: {
        state: 'deleting',
        deleteClaimedAt: new Date(),
        deleteClaimedBy: claimId
      }
    },
    { new: true, session }
  ).lean();
  if (claimed) return 'claimed';

  let existing = await findSiteAvatarState({ avatarKey, session });
  // 兼容没有状态文档的历史 TTL/删除任务：先补一个 pending，再按正常流程领取。
  if (!existing) {
    await markSiteAvatarDeletionPending({ avatarKey, session });
    const claimedLegacy = await MongoSiteAvatarState.findOneAndUpdate(
      { avatarKey, state: 'pending' },
      {
        $set: {
          state: 'deleting',
          deleteClaimedAt: new Date(),
          deleteClaimedBy: claimId
        }
      },
      { new: true, session }
    ).lean();
    if (claimedLegacy) return 'claimed';
    existing = await findSiteAvatarState({ avatarKey, session });
  }

  if (existing?.state === 'deleting') {
    return existing.deleteClaimedBy === claimId ? 'claimed' : 'deleting';
  }
  return existing?.state === 'referenced' ? 'referenced' : 'deleting';
};

/** 删除成功或确认对象已不存在后清理状态文档；只清理当前任务仍持有的 claim。 */
export const clearSiteAvatarDeletionState = async ({
  avatarKey,
  claimId,
  session
}: {
  avatarKey: string;
  claimId: string;
  session?: ClientSession;
}) => {
  await MongoSiteAvatarState.deleteOne(
    { avatarKey, state: 'deleting', deleteClaimedBy: claimId },
    { session }
  );
};

/** 删除失败时释放当前任务的领取，交给同一个 BullMQ job 的后续重试。 */
export const releaseSiteAvatarDeletion = async ({
  avatarKey,
  claimId,
  session
}: {
  avatarKey: string;
  claimId: string;
  session?: ClientSession;
}) => {
  await MongoSiteAvatarState.updateOne(
    { avatarKey, state: 'deleting', deleteClaimedBy: claimId },
    {
      $set: { state: 'pending' },
      $unset: { deleteClaimedAt: 1, deleteClaimedBy: 1 }
    },
    { session }
  );
};
