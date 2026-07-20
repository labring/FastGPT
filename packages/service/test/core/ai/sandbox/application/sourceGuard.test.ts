import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { assertSandboxSourceActive } from '@fastgpt/service/core/ai/sandbox/application/sourceGuard';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

describe('assertSandboxSourceActive', () => {
  it('uses the caller transaction and rejects a source already marked for deletion', async () => {
    const activeId = new Types.ObjectId();
    const deletedId = new Types.ObjectId();
    await MongoApp.collection.insertMany([
      { _id: activeId, deleteTime: null },
      { _id: deletedId, deleteTime: new Date() }
    ]);

    const session = await connectionMongo.startSession();
    try {
      await expect(
        assertSandboxSourceActive({
          sourceType: ChatSourceTypeEnum.app,
          sourceId: activeId.toString(),
          session
        })
      ).resolves.toBeUndefined();
    } finally {
      await session.endSession();
    }

    await expect(
      assertSandboxSourceActive({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: deletedId.toString()
      })
    ).rejects.toThrow('missing or deleted');
  });
});
