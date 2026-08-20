import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { toUser } from '../../../../mongodb/business/support/user/entity';
import type { UserDocument } from '../../../../mongodb/business/support/user/schema';

const createDocument = (overrides: Partial<UserDocument> = {}): UserDocument => ({
  _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
  __v: 3,
  status: UserStatusEnum.active,
  username: 'user@example.com',
  password: 'hashed-password',
  passwordUpdateTime: new Date('2026-02-01T00:00:00.000Z'),
  createTime: new Date('2026-01-01T00:00:00.000Z'),
  promotionRate: 0.1,
  openaiAccount: { key: 'key', baseUrl: 'https://example.com' },
  timezone: 'Asia/Shanghai',
  language: 'zh-CN',
  lastLoginTmbId: new Types.ObjectId('507f1f77bcf86cd799439012'),
  inviterId: new Types.ObjectId('507f1f77bcf86cd799439013'),
  fastgpt_sem: { keyword: 'FastGPT' },
  phonePrefix: 86,
  contact: '13800000000',
  tags: ['wecom'],
  meta: { isActivatedWecomLicense: true },
  avatar: 'avatar.png',
  ...overrides
});

describe('toUser', () => {
  it('maps all production fields and converts ObjectIds to entity ids', () => {
    const user = toUser(createDocument());

    expect(user.id).toBe('507f1f77bcf86cd799439011');
    expect(user.lastLoginTmbId).toBe('507f1f77bcf86cd799439012');
    expect(user.inviterId).toBe('507f1f77bcf86cd799439013');
    expect(user.meta).toEqual({ isActivatedWecomLicense: true });
  });

  it('does not leak Mongo metadata or password', () => {
    const user = toUser(createDocument());

    expect(user).not.toHaveProperty('_id');
    expect(user).not.toHaveProperty('__v');
    expect(user).not.toHaveProperty('password');
  });

  it('keeps missing optional references undefined', () => {
    const user = toUser(createDocument({ lastLoginTmbId: undefined, inviterId: undefined }));

    expect(user.lastLoginTmbId).toBeUndefined();
    expect(user.inviterId).toBeUndefined();
  });

  it('normalizes legacy explicit null values to undefined', () => {
    const user = toUser(
      createDocument({
        passwordUpdateTime: null,
        openaiAccount: null,
        fastgpt_sem: null,
        phonePrefix: null,
        contact: null,
        meta: null,
        avatar: null
      } as unknown as Partial<UserDocument>)
    );

    expect(user.passwordUpdateTime).toBeUndefined();
    expect(user.openaiAccount).toBeUndefined();
    expect(user.fastgpt_sem).toBeUndefined();
    expect(user.phonePrefix).toBeUndefined();
    expect(user.contact).toBeUndefined();
    expect(user.meta).toBeUndefined();
    expect(user.avatar).toBeUndefined();
  });

  it('applies production defaults to historical documents with missing fields', () => {
    const document = createDocument({
      status: undefined,
      createTime: undefined,
      promotionRate: undefined,
      timezone: undefined,
      language: undefined,
      tags: undefined
    });

    expect(toUser(document)).toMatchObject({
      status: UserStatusEnum.active,
      createTime: document._id.getTimestamp(),
      promotionRate: 0,
      timezone: 'Asia/Shanghai',
      language: LangEnum.zh_CN,
      tags: []
    });
  });

  it('rejects invalid persisted domain values', () => {
    expect(() => toUser(createDocument({ language: 'invalid' }))).toThrow();
  });
});
