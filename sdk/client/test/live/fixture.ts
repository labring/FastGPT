import { mongo } from 'mongoose';
import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastGPT } from '../../src/client';

/**
 * 为真实 API Key 测试创建独立团队及凭证。仅清理本次生成的精确 ID；
 * 不借用现有用户凭证，不把密钥、连接字符串写入日志。
 */
export const createLiveFixture = async () => {
  const repo = resolve(import.meta.dirname, '../../../..');
  const env = parseEnv(await readFile(resolve(repo, 'projects/app/.env.local'), 'utf8'));
  const uri = process.env.FASTGPT_TEST_MONGODB_URI ?? env.MONGODB_URI;
  if (!uri) throw new Error('Set FASTGPT_TEST_MONGODB_URI or projects/app/.env.local MONGODB_URI');
  const mongoClient = new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoClient.connect();
  const db = mongoClient.db();
  const teamId = new mongo.ObjectId();
  const userId = new mongo.ObjectId();
  const userIds = [userId];
  const tmbId = new mongo.ObjectId();
  const keyId = new mongo.ObjectId();
  const apiKey = `fastgpt-sdk-test-${randomUUID()}`;
  const name = `SDK E2E ${randomUUID()}`;
  const baseURL = process.env.FASTGPT_TEST_BASE_URL ?? 'http://localhost:3000';
  const client = new FastGPT({ baseURL, apiKey, timeoutMs: 120000 });
  const datasetIds: string[] = [];

  await db
    .collection('users')
    .insertOne({ _id: userId, username: name, status: 'active', createTime: new Date() });
  await db
    .collection('teams')
    .insertOne({ _id: teamId, ownerId: userId, name, balance: 100000000, createTime: new Date() });
  await db.collection('team_members').insertOne({
    _id: tmbId,
    userId,
    teamId,
    name: 'SDK E2E Owner',
    role: 'owner',
    status: 'active',
    isSetMemberName: true
  });
  await db.collection('openapis').insertOne({
    _id: keyId,
    teamId,
    tmbId,
    apiKey,
    name: 'SDK integration key',
    usagePoints: 0,
    createTime: new Date(),
    limit: { maxUsagePoints: -1 }
  });

  return {
    client,
    db,
    apiKey,
    baseURL,
    teamId: String(teamId),
    tmbId: String(tmbId),
    datasetIds,
    async createMember() {
      const memberUserId = new mongo.ObjectId();
      const memberId = new mongo.ObjectId();
      const memberKey = `fastgpt-sdk-member-${randomUUID()}`;
      userIds.push(memberUserId);
      await db.collection('users').insertOne({
        _id: memberUserId,
        username: `SDK member ${randomUUID()}`,
        status: 'active',
        createTime: new Date()
      });
      await db.collection('team_members').insertOne({
        _id: memberId,
        userId: memberUserId,
        teamId,
        name: 'SDK E2E Member',
        status: 'active',
        isSetMemberName: true
      });
      await db.collection('openapis').insertOne({
        teamId,
        tmbId: memberId,
        apiKey: memberKey,
        name: 'SDK member key',
        usagePoints: 0,
        createTime: new Date()
      });
      return {
        tmbId: String(memberId),
        client: new FastGPT({ baseURL, apiKey: memberKey, timeoutMs: 120000 })
      };
    },
    /** 只删除本次临时团队上传的搜索图片，同时移除其 TTL 与下载别名。 */
    async cleanupTemporaryImage(key: string) {
      if (!key.startsWith(`temp/${teamId}/`))
        throw new Error('Refusing to delete a foreign object');
      if ((env.STORAGE_VENDOR ?? 'minio') !== 'minio') {
        throw new Error('This dev fixture requires MinIO for explicit temporary image cleanup');
      }
      const { createStorage } = await import('../../../storage/dist/index.js');
      const bucket = env.STORAGE_PRIVATE_BUCKET ?? 'fastgpt-private';
      const accessKeyId = env.STORAGE_ACCESS_KEY_ID;
      const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY;
      if (!accessKeyId || !secretAccessKey) throw new Error('MinIO dev credentials are required');
      const storage = createStorage({
        vendor: 'minio',
        bucket,
        endpoint: env.STORAGE_S3_ENDPOINT ?? 'http://localhost:9000',
        region: env.STORAGE_REGION ?? 'us-east-1',
        credentials: {
          accessKeyId,
          secretAccessKey
        },
        forcePathStyle: ['true', '1'].includes(env.STORAGE_S3_FORCE_PATH_STYLE ?? 'false')
      });
      await storage.deleteObject({ key });
      await db.collection('s3_ttls').deleteMany({ bucketName: bucket, minioKey: key });
      await db.collection('s3_download_aliases').deleteMany({ bucketName: bucket, objectKey: key });
    },
    /** 使用真实 API 投递清理；等待异步知识库清理后再删除测试身份。 */
    async cleanup() {
      try {
        for (const id of datasetIds) {
          if (
            await db
              .collection('datasets')
              .findOne({ _id: new mongo.ObjectId(id), deleteTime: null })
          ) {
            await client.datasets.delete({ id });
          }
        }
        const deadline = Date.now() + 60000;
        while (await db.collection('datasets').countDocuments({ teamId })) {
          if (Date.now() > deadline) throw new Error('Timed out waiting for test dataset cleanup');
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        for (const collection of await db.listCollections({}, { nameOnly: true }).toArray()) {
          if (collection.name.startsWith('system.')) continue;
          await db.collection(collection.name).deleteMany({ teamId });
        }
        await db.collection('users').deleteMany({ _id: { $in: userIds } });
        await db.collection('teams').deleteOne({ _id: teamId });
      } finally {
        await mongoClient.close();
      }
    }
  };
};
