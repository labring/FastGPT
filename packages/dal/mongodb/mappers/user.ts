import { UserSchema, type User } from '../../domain/user';
import type { UserDocument } from '../models/user';
import { toEntityId } from '../utils';

/** 将 Mongo User 文档显式映射为领域实体，避免泄漏 `_id`、`__v` 和 password。 */
export const toUser = (document: UserDocument): User =>
  UserSchema.parse({
    id: toEntityId(document._id),
    status: document.status,
    username: document.username,
    passwordUpdateTime: document.passwordUpdateTime,
    createTime: document.createTime,
    promotionRate: document.promotionRate,
    openaiAccount: document.openaiAccount,
    timezone: document.timezone,
    language: document.language,
    lastLoginTmbId: document.lastLoginTmbId ? toEntityId(document.lastLoginTmbId) : undefined,
    inviterId: document.inviterId ? toEntityId(document.inviterId) : undefined,
    fastgpt_sem: document.fastgpt_sem,
    phonePrefix: document.phonePrefix,
    contact: document.contact,
    tags: document.tags,
    meta: document.meta,
    avatar: document.avatar
  });
