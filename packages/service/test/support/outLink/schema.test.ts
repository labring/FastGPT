import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';

const modelName = `OutlinkWebsocket_${randomUUID().replaceAll('-', '')}`;
const model = connectionMongo.model(
  modelName,
  MongoOutLink.schema.clone(),
  modelName.toLowerCase()
);

const createChannel = ({
  botId,
  type = PublishChannelEnum.wecomWebsocket
}: {
  botId?: string;
  type?: PublishChannelEnum;
}) => ({
  shareId: randomUUID(),
  teamId: new Types.ObjectId(),
  tmbId: new Types.ObjectId(),
  appId: new Types.ObjectId(),
  type,
  name: 'Test channel',
  app: {
    ...(botId ? { botId } : {}),
    secret: 'test-secret',
    revision: 1,
    connectionStatus: 'offline'
  }
});

describe('OutLink websocket storage and uniqueness', () => {
  beforeAll(async () => {
    await MongoIndexManager.syncModelIndexes({ model });
  });

  it('rejects duplicate websocket Bot IDs across teams', async () => {
    await model.create(createChannel({ botId: 'shared-bot' }));
    await expect(model.create(createChannel({ botId: 'shared-bot' }))).rejects.toMatchObject({
      code: 11000
    });
    expect(await model.countDocuments({ 'app.botId': 'shared-bot' })).toBe(1);
  });

  it('rejects a Bot ID update that conflicts with another channel without changing its config', async () => {
    await model.create(createChannel({ botId: 'bot-a' }));
    const channel = await model.create(createChannel({ botId: 'bot-b' }));
    await expect(
      model.updateOne({ _id: channel._id }, { $set: { 'app.botId': 'bot-a', 'app.revision': 2 } })
    ).rejects.toMatchObject({ code: 11000 });
    expect((await model.findById(channel._id).lean())?.app).toMatchObject({
      botId: 'bot-b',
      revision: 1
    });
  });

  it('does not constrain old channels with duplicate or absent Bot IDs', async () => {
    const channel = { botId: 'webhook-bot', type: PublishChannelEnum.wecom };
    await model.create(createChannel(channel));
    await model.create(createChannel(channel));
    await model.create(createChannel({ type: PublishChannelEnum.wecom }));
    await model.create(createChannel({ type: PublishChannelEnum.feishu }));
    await model.create(createChannel({ botId: 'webhook-bot' }));
    expect(await model.countDocuments({ 'app.botId': 'webhook-bot' })).toBe(3);
  });

  it('allows a deleted Bot binding to be reused by a new channel', async () => {
    const original = await model.create(createChannel({ botId: 'reusable-bot' }));
    await model.deleteOne({ _id: original._id });
    const replacement = await model.create(createChannel({ botId: 'reusable-bot' }));
    expect(replacement.shareId).not.toBe(original.shareId);
    expect(await model.countDocuments({ 'app.botId': 'reusable-bot' })).toBe(1);
  });

  it('stores status in app and keeps expiry in the common limit object', async () => {
    const expiredTime = new Date('2099-01-01T00:00:00Z');
    const lastReportedAt = new Date('2026-10-13T00:00:00Z');
    const channel = createChannel({ botId: 'status-bot' });
    const stored = await model.create({
      ...channel,
      app: {
        ...channel.app,
        connectionStatus: 'error',
        connectionStatusMeta: { lastReportedAt, errorCode: 'AUTH_FAILED' }
      },
      limit: { expiredTime, QPM: 42, maxUsagePoints: 100 }
    });
    const result = await model.findById(stored._id).lean();
    expect(result?.app).toMatchObject({
      botId: 'status-bot',
      connectionStatus: 'error',
      connectionStatusMeta: { lastReportedAt, errorCode: 'AUTH_FAILED' }
    });
    expect(result?.limit).toMatchObject({ expiredTime, QPM: 42, maxUsagePoints: 100 });
    expect(result).not.toHaveProperty('connectionStatus');
    expect(result?.app).not.toHaveProperty('expiredTime');
  });
});
