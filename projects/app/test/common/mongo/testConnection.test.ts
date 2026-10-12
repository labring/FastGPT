import mongoose, { Schema } from '@fastgpt/service/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { describe, expect, inject, it, vi } from 'vitest';

describe('isolated test Mongo connection', () => {
  it('initializes pre-registered models without dropping the newly connected database', async () => {
    const db = new mongoose.Mongoose();
    const model = db.model('connection_lifecycle', new Schema({ value: String }));
    const connectedCb = vi.fn();
    let dropCalled = false;

    // Mongoose 在连接建立后自动建表，连接 helper 此时删库会与 model.init 竞争。
    db.connection.once('connected', () => {
      vi.spyOn(db.connection.db!, 'dropDatabase').mockImplementation(async () => {
        dropCalled = true;
        throw new Error('Test database dropped during model initialization');
      });
    });

    try {
      expect(await connectMongo({ db, url: inject('MONGODB_URI'), connectedCb })).toBe(db);
      await model.init();
      await model.create({ value: 'preserved' });
      expect(dropCalled).toBe(false);
      expect(connectedCb).toHaveBeenCalledOnce();
      expect(await model.countDocuments({ value: 'preserved' })).toBe(1);

      // 重复连接不能清空当前用例已经写入的数据。
      await connectMongo({ db, url: inject('MONGODB_URI'), connectedCb });
      expect(await model.countDocuments({ value: 'preserved' })).toBe(1);
      expect(connectedCb).toHaveBeenCalledOnce();
    } finally {
      // 即使断言失败，也等自动建表结束后再清理隔离数据库。
      await model.init().catch(() => undefined);
      vi.restoreAllMocks();
      await db.connection.db?.dropDatabase();
      await db.disconnect();
    }
  });
});
