import { beforeEach, describe, expect, it } from 'vitest';
import {
  MongoUser,
  addUserAccountBinding
} from '@fastgpt/service/support/user/schema';
import {
  SYSTEM_SYNC_ACCOUNT_SOURCE,
  UserAccountBindingStatusMap
} from '@fastgpt/global/support/user/type';

/**
 * accounts 身份绑定：真实 MongoDB 回归。
 * 覆盖 (source, id) partial unique 索引的跨用户唯一性，以及统一原子写入入口的文档内幂等。
 */
describe('user accounts binding index and atomic helper', () => {
  beforeEach(async () => {
    await MongoUser.deleteMany({});
  });

  it('users with missing or empty accounts coexist without index conflicts', async () => {
    await MongoUser.create([{ username: 'no-accounts-user' }, { username: 'legacy-user' }]);
    await MongoUser.create({ username: 'empty-accounts-user', accounts: [] });
    expect(await MongoUser.countDocuments({})).toBe(3);
  });

  it('rejects the same (source,id) across users while different sources reuse the id', async () => {
    await MongoUser.create([
      { username: 'weaver-user', accounts: [{ source: 'weaver', id: '77000136', status: 'active' }] },
      { username: 'wecom-user', accounts: [{ source: 'wecom', id: '77000136', status: 'active' }] }
    ]);
    expect(await MongoUser.countDocuments({})).toBe(2);

    // 跨用户同键：唯一索引拒绝（E11000）
    await expect(
      MongoUser.create({
        username: 'conflict-user',
        accounts: [{ source: 'weaver', id: '77000136', status: 'active' }]
      })
    ).rejects.toThrow(/duplicate|E11000/i);

    // 离职置 disabled 的行仍占用唯一键（防同 id 被冒领）
    const holder = await MongoUser.create({
      username: 'holder-user',
      accounts: [{ source: SYSTEM_SYNC_ACCOUNT_SOURCE, id: '77000140', status: UserAccountBindingStatusMap.active }]
    });
    await MongoUser.updateOne(
      { _id: holder._id, accounts: { $elemMatch: { source: SYSTEM_SYNC_ACCOUNT_SOURCE } } },
      { $set: { 'accounts.$.status': UserAccountBindingStatusMap.disabled } }
    );
    await expect(
      MongoUser.create({
        username: 'grabber-user',
        accounts: [{ source: SYSTEM_SYNC_ACCOUNT_SOURCE, id: '77000140', status: 'active' }]
      })
    ).rejects.toThrow(/duplicate|E11000/i);
  });

  it('addUserAccountBinding is idempotent within one document and reports the write result', async () => {
    const user = await MongoUser.create({ username: 'atomic-user' });

    expect(
      await addUserAccountBinding({
        userId: String(user._id),
        source: SYSTEM_SYNC_ACCOUNT_SOURCE,
        id: '77000136'
      })
    ).toBe('written');

    // 同文档同键重复请求 → 'exists'，不产生第二行（唯一索引不约束文档内重复，由条件写入挡住）
    expect(
      await addUserAccountBinding({
        userId: String(user._id),
        source: SYSTEM_SYNC_ACCOUNT_SOURCE,
        id: '77000136'
      })
    ).toBe('exists');

    const doc = await MongoUser.findById(user._id).lean();
    expect(doc?.accounts).toHaveLength(1);
    expect(doc?.accounts?.[0]).toMatchObject({
      source: SYSTEM_SYNC_ACCOUNT_SOURCE,
      id: '77000136',
      status: 'active'
    });
  });
});
