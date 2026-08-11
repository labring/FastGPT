import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { UserSchema, type User } from '../../domain/user';
import type { UserDocument } from '../models/user';
import { toEntityId } from '../utils';

export const toUser = (document: UserDocument): User =>
  UserSchema.parse({
    id: toEntityId(document._id),
    status: document.status ?? UserStatusEnum.active,
    username: document.username,
    passwordUpdateTime: document.passwordUpdateTime,
    createTime: document.createTime ?? document._id.getTimestamp(),
    promotionRate: document.promotionRate ?? 0,
    openaiAccount: document.openaiAccount,
    timezone: document.timezone ?? 'Asia/Shanghai',
    language: document.language ?? LangEnum.zh_CN,
    lastLoginTmbId: document.lastLoginTmbId ? toEntityId(document.lastLoginTmbId) : undefined,
    inviterId: document.inviterId ? toEntityId(document.inviterId) : undefined,
    fastgpt_sem: document.fastgpt_sem,
    phonePrefix: document.phonePrefix,
    contact: document.contact,
    tags: document.tags ?? [],
    meta: document.meta,
    avatar: document.avatar
  });
