import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import type { UserTagsType } from '@fastgpt/global/support/user/type';
import type { User } from '../../../../business/support/user/entity';
import { UserSchema } from '../../../../business/support/user/entity';
import type { UserDocument } from './schema';
import { toEntityId } from '../../../utils';

/** Mongo 文档映射为共享 User 实体时使用的生产默认值。 */
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

/** 将 Mongo 用户文档转换为数据库无关的 User 实体，并隐藏 Mongo 元数据和密码。 */
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
