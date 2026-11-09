import { defineIndex, Schema, getMongoModel } from '../../mongo';

/**
 * 站点头像删除协调状态。
 *
 * S3 删除无法与 Mongo 配置写入放在同一事务里，因此用一个对象级状态文档把「重新引用」
 * 和「最终删除」串行化：
 * - referenced: 当前站点正在引用，删除任务不得删除；
 * - pending: 已失去引用并写入 TTL，等待清理任务领取；
 * - deleting: 删除任务已原子领取，新的引用保存必须失败并让用户重试，
 *   避免旧删除请求完成后再写入一个指向已删除对象的配置。
 */
export type SiteAvatarStateType = {
  avatarKey: string;
  state: 'referenced' | 'pending' | 'deleting';
  /** 最近一次引用它的站点配置 revision；用于让延迟执行的旧保存不会覆盖新引用。 */
  referencedRevision?: number;
  deleteClaimedAt?: Date;
};

const collectionName = 's3_site_avatar_states';

const SiteAvatarStateSchema = new Schema(
  {
    avatarKey: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      enum: ['referenced', 'pending', 'deleting']
    },
    referencedRevision: {
      type: Number,
      required: false,
      min: 0
    },
    deleteClaimedAt: {
      type: Date,
      required: false
    }
  },
  { timestamps: true }
);

defineIndex(SiteAvatarStateSchema, {
  key: { avatarKey: 1 },
  options: { unique: true }
});

export const MongoSiteAvatarState = getMongoModel<SiteAvatarStateType>(
  collectionName,
  SiteAvatarStateSchema
);
