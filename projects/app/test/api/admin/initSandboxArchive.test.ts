import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';
import { subDays } from 'date-fns';
import mongoose from 'mongoose';

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://localhost:8090',
    AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'mock-api-key',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker'
  }
}));

const adminMocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  archiveSandboxResource: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: adminMocks.authCert
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/archive', () => ({
  archiveSandboxResource: adminMocks.archiveSandboxResource
}));

import { migrateSandboxArchiveData } from '@/pages/api/admin/initSandboxArchive';

describe('FastGPT Sandbox Archive Migration API', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 清理测试沙盒记录
    await MongoSandboxInstance.deleteMany({ sandboxId: /^test-sandbox-archive-/ });
    adminMocks.archiveSandboxResource.mockResolvedValue({ success: true });
  });

  it('successfully migrates status "stoped" -> "stopped" and fills missing lastActiveAt', async () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z');

    const doc1Id = new mongoose.Types.ObjectId();
    await MongoSandboxInstance.collection.insertOne({
      _id: doc1Id,
      provider: 'opensandbox',
      sandboxId: 'test-sandbox-archive-1',
      status: 'stoped',
      lastActiveAt: createdAt,
      createdAt
    });

    const doc2Id = new mongoose.Types.ObjectId();
    await MongoSandboxInstance.collection.insertOne({
      _id: doc2Id,
      provider: 'opensandbox',
      sandboxId: 'test-sandbox-archive-2',
      status: 'running',
      createdAt
    });
    await MongoSandboxInstance.updateOne({ _id: doc2Id }, { $unset: { lastActiveAt: '' } });

    const result = await migrateSandboxArchiveData({ runArchive: false });

    expect(result.statusUpdateCount).toBe(1);
    expect(result.lastActiveUpdatedCount).toBe(1);
    expect(result.archiveTriggered).toBe(false);
    expect(result.archiveResult).toBeNull();

    const updatedDoc1 = await MongoSandboxInstance.findOne({ _id: doc1Id });
    expect(updatedDoc1?.status).toBe('stopped');

    const updatedDoc2 = await MongoSandboxInstance.findOne({ _id: doc2Id });
    expect(updatedDoc2?.lastActiveAt).toBeDefined();
  });

  it('reports precise error details when archiving fails due to connection issues', async () => {
    const inactiveDate = subDays(new Date(), 10);

    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'test-sandbox-archive-err',
      status: 'stopped',
      lastActiveAt: inactiveDate,
      createdAt: inactiveDate
    });

    adminMocks.archiveSandboxResource.mockResolvedValue({
      success: false,
      error: 'Mock connection timeout to Devbox'
    });

    const result = await migrateSandboxArchiveData({ runArchive: true, inactiveDays: 5 });

    expect(result.archiveTriggered).toBe(true);
    expect(result.archiveResult).not.toBeNull();
    expect(result.archiveResult?.total).toBe(1);
    expect(result.archiveResult?.successCount).toBe(0);
    expect(result.archiveResult?.failCount).toBe(1);
    expect(result.archiveResult?.failures).toEqual([
      {
        sandboxId: 'test-sandbox-archive-err',
        error: 'Mock connection timeout to Devbox'
      }
    ]);

    expect(adminMocks.archiveSandboxResource).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'test-sandbox-archive-err'
      }),
      expect.any(Date)
    );
  });
});
