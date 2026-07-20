import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FeatureLevel,
  MilvusVersionManager
} from '@fastgpt/service/common/vectorDB/milvus/version';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';

const createMockClient = (version: string, probeOk = true): MilvusClient => {
  return {
    getVersion: vi.fn().mockResolvedValue({ version }),
    createCollection: vi.fn().mockResolvedValue({}),
    createIndex: vi.fn().mockResolvedValue({}),
    dropCollection: vi.fn().mockResolvedValue({})
  } as unknown as MilvusClient;
};

describe('MilvusVersionManager', () => {
  let manager: MilvusVersionManager;

  beforeEach(() => {
    manager = new MilvusVersionManager();
  });

  it('detects v2.6.0 as V26', async () => {
    const client = createMockClient('v2.6.0');
    const level = await manager.detectVersion(client);
    expect(level).toBe(FeatureLevel.V26);
    expect(manager.supportsFullText()).toBe(true);
  });

  it('detects 2.4.0 as V24', async () => {
    const client = createMockClient('2.4.0');
    const level = await manager.detectVersion(client);
    expect(level).toBe(FeatureLevel.V24);
    expect(manager.supportsFullText()).toBe(false);
  });

  it('detects v3.0.0 as V26 after probe', async () => {
    const client = createMockClient('v3.0.0');
    const level = await manager.detectVersion(client);
    expect(level).toBe(FeatureLevel.V26);
  });

  it('caches detection result and does not call getVersion again', async () => {
    const client = createMockClient('v2.6.5');
    await manager.detectVersion(client);
    await manager.detectVersion(client);
    expect(client.getVersion).toHaveBeenCalledTimes(1);
  });

  it('returns UNKNOWN on invalid version format', async () => {
    const client = createMockClient('unknown');
    const level = await manager.detectVersion(client);
    expect(level).toBe(FeatureLevel.UNKNOWN);
    expect(manager.supportsFullText()).toBe(false);
  });

  it('returns UNKNOWN on getVersion error', async () => {
    const client = {
      getVersion: vi.fn().mockRejectedValue(new Error('timeout'))
    } as unknown as MilvusClient;
    const level = await manager.detectVersion(client);
    expect(level).toBe(FeatureLevel.UNKNOWN);
  });

  it('resetDetection forces re-detection', async () => {
    const client = createMockClient('v2.6.0');
    await manager.detectVersion(client);
    await manager.resetDetection(client);
    expect(client.getVersion).toHaveBeenCalledTimes(2);
  });
});
