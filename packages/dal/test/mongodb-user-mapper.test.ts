import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { toUser } from '../mongodb/mappers/user';

describe('Mongo user mapper', () => {
  it('maps Mongo _id and ObjectId reference fields to string ids', () => {
    const user = toUser({
      _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
      status: 'active',
      username: 'user@example.com',
      password: 'hashed-password',
      promotionRate: 0,
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
      tags: [],
      createTime: new Date('2026-01-01T00:00:00.000Z'),
      lastLoginTmbId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      __v: 0
    });

    expect(user.id).toBe('507f1f77bcf86cd799439011');
    expect(user.lastLoginTmbId).toBe('507f1f77bcf86cd799439012');
  });

  it('maps a missing reference to null', () => {
    const user = toUser({
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      status: 'active',
      username: 'user@example.com',
      password: 'hashed-password',
      promotionRate: 0,
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
      tags: [],
      createTime: new Date(),
      lastLoginTmbId: null,
      __v: 0
    });

    expect(user.lastLoginTmbId).toBeNull();
  });
});
