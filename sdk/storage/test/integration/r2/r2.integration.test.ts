import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createStorage } from '../../../src/factory';
import type { IStorage } from '../../../src/interface';

const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing integration test environment variable: ${name}`);
  return value;
};

const r2Enabled = process.env.STORAGE_TEST_R2_ENABLED?.toLowerCase() === 'true';

describe.skipIf(!r2Enabled).sequential('R2-specific integration', () => {
  let storage: IStorage | undefined;
  const key = `contract/${randomUUID()}/public/file.txt`;

  afterAll(async () => {
    if (!storage) return;
    await storage.deleteObject({ key }).catch(() => undefined);
    await storage.destroy();
  });

  it('reads a public object through the configured public endpoint', async () => {
    const endpoint = getRequiredEnv('STORAGE_TEST_R2_ENDPOINT');
    const region = getRequiredEnv('STORAGE_TEST_R2_REGION');
    const accessKeyId = getRequiredEnv('STORAGE_TEST_R2_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('STORAGE_TEST_R2_SECRET_ACCESS_KEY');
    const bucket = getRequiredEnv('STORAGE_TEST_R2_PUBLIC_BUCKET');
    const publicEndpoint = getRequiredEnv('STORAGE_TEST_R2_PUBLIC_ENDPOINT');

    storage = createStorage({
      vendor: 'r2',
      bucket,
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
      publicEndpoint
    });
    await storage.uploadObject({
      key,
      body: 'r2-public-integration',
      contentType: 'text/plain',
      contentLength: 21
    });

    const publicUrl = storage.generatePublicGetUrl({ key }).url;
    const response = await fetch(publicUrl);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('r2-public-integration');
  });
});
