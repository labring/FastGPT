import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectMongoIntegration, disconnectMongoIntegration } from './client';
import type { Mongoose } from 'mongoose';

describe('MongoDB integration test harness', () => {
  let client: Mongoose | undefined;

  beforeAll(async () => {
    client = await connectMongoIntegration();
  });

  afterAll(async () => {
    await disconnectMongoIntegration(client);
  });

  it('connects to the configured MongoDB Replica Set', async () => {
    await expect(client?.connection.db?.command({ ping: 1 })).resolves.toMatchObject({ ok: 1 });
  });
});
