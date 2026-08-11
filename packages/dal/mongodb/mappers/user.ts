import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import type { UserTagsType } from '@fastgpt/global/support/user/type';
import { UserSchema, type User } from '../../domain/user';
import type { UserDocument } from '../models/user';
import { toEntityId } from '../utils';

/** toUser 与旧 ClientSession 兼容分支共用的用户字段默认值，避免两处默认值漂移。 */
export const userDefaultFieldValues: {
  timezone: string;
  promotionRate: number;
  language: string;
  tags: UserTagsType[];
} = {
  timezone: 'Asia/Shanghai',
  promotionRate: 0,
  language: LangEnum.zh_CN,
  tags: []
};

export const toUser = (document: UserDocument): User =>
  UserSchema.parse({
    id: toEntityId(document._id),
    status: document.status ?? UserStatusEnum.active,
    username: document.username,
    passwordUpdateTime: document.passwordUpdateTime ?? undefined,
    createTime: document.createTime ?? document._id.getTimestamp(),
    promotionRate: document.promotionRate ?? userDefaultFieldValues.promotionRate,
    openaiAccount: document.openaiAccount ?? undefined,
    timezone: document.timezone ?? userDefaultFieldValues.timezone,
    language: document.language ?? userDefaultFieldValues.language,
    lastLoginTmbId: document.lastLoginTmbId ? toEntityId(document.lastLoginTmbId) : undefined,
    inviterId: document.inviterId ? toEntityId(document.inviterId) : undefined,
    fastgpt_sem: document.fastgpt_sem ?? undefined,
    phonePrefix: document.phonePrefix ?? undefined,
    contact: document.contact ?? undefined,
    tags: document.tags ?? userDefaultFieldValues.tags,
    meta: document.meta ?? undefined,
    avatar: document.avatar ?? undefined
  });
