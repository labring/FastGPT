import { defineIndex, connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import type { ClientSession } from 'mongoose';
import { hashStr } from '@fastgpt/global/common/string/tools';
import {
  SYSTEM_SYNC_ACCOUNT_SOURCE,
  UserAccountBindingStatusMap,
  UserTagsSchema,
  type UserAccountBindingStatus,
  type UserModelSchema
} from '@fastgpt/global/support/user/type';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { LangEnum } from '@fastgpt/global/common/i18n/type';

export const userCollectionName = 'users';

// 外部身份绑定行（V3 极简模型）：(source, id) 全局唯一，由 UserSchema 上的 partial unique 索引强制；
// source 保留字与状态枚举统一从 global 共享定义取得，schema 不再维护第二份常量。
const UserAccountItemSchema = new Schema(
  {
    source: {
      type: String,
      required: true
    },
    id: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.keys(UserAccountBindingStatusMap),
      default: UserAccountBindingStatusMap.active
    }
  },
  { _id: false }
);

// 历史缺失、null 和空字符串必须保留为“无密码”，不能被哈希成有效摘要。
const hashPasswordValue = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? hashStr(value) : value;

const UserSchema = new Schema({
  status: {
    type: String,
    enum: Object.keys(userStatusMap),
    default: UserStatusEnum.active
  },
  username: {
    // 可以是手机/邮箱，新的验证都只用手机
    type: String,
    required: true
  },
  password: {
    type: String,
    required: false,
    set: hashPasswordValue,
    get: hashPasswordValue,
    select: false
  },
  passwordUpdateTime: Date,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  openaiAccount: {
    type: {
      key: String,
      baseUrl: String
    }
  },
  timezone: {
    type: String,
    default: 'Asia/Shanghai'
  },
  language: {
    type: String,
    default: LangEnum.zh_CN
  },
  lastLoginTmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName
  },

  fastgpt_sem: Object,

  phonePrefix: Number,
  contact: String,

  tags: {
    type: [String],
    enum: UserTagsSchema.enum
  },
  meta: Object,
  /** 外部身份绑定数组：每行 (source, id) 为一个登录/同步身份入口；写入必须走统一原子 helper */
  accounts: {
    type: [UserAccountItemSchema],
    default: undefined
  },
  /** @deprecated */
  avatar: String
});

// username 唯一。
defineIndex(UserSchema, {
  key: { username: 1 },
  options: { unique: true }
});
// 管理端用户列表按状态过滤并按 _id 倒序分页，复合索引可同时满足过滤和排序。
defineIndex(UserSchema, { key: { status: 1, _id: -1 } });
// Admin charts
defineIndex(UserSchema, { key: { createTime: -1 } });
// 外部身份 (source, id) 全局唯一（跨用户）：partial 过滤无 accounts 的文档，
// 同步圈人（source='system-sync'）与 SSO 登录点查 (source, id) 均走此索引。
defineIndex(UserSchema, {
  key: { 'accounts.source': 1, 'accounts.id': 1 },
  options: {
    unique: true,
    partialFilterExpression: { 'accounts.source': { $gte: '' } }
  }
});

export const MongoUser = getMongoModel<UserModelSchema>(userCollectionName, UserSchema);

/**
 * 统一原子入口：给用户补写一条 (source, id) 身份绑定行。
 *
 * 唯一索引只约束跨文档；同一文档内的同键重复由这里的 `$not: {$elemMatch}` 条件挡住，
 * 并发首次认领时只有一个写入者拿到 matched，其余返回 'exists'（幂等，无需调用方加锁）。
 * 同步认领、SSO 登录认领、存量回填都必须走本入口写入 accounts 行，禁止裸 $push。
 */
export const addUserAccountBinding = async ({
  userId,
  source,
  id,
  status = UserAccountBindingStatusMap.active,
  session
}: {
  userId: string;
  source: string;
  id: string;
  status?: UserAccountBindingStatus;
  session?: ClientSession;
}): Promise<'written' | 'exists'> => {
  const result = await MongoUser.updateOne(
    {
      _id: userId,
      accounts: { $not: { $elemMatch: { source, id } } }
    },
    {
      $push: {
        accounts: {
          source,
          id,
          status
        }
      }
    },
    { session }
  );
  return result.matchedCount > 0 ? 'written' : 'exists';
};
