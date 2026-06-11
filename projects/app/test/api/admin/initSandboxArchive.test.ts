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
  archiveSandboxResources: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: adminMocks.authCert
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/archive', () => ({
  archiveSandboxResources: adminMocks.archiveSandboxResources
}));

import { migrateSandboxArchiveData } from '@/pages/api/admin/initSandboxArchive';

describe('FastGPT Sandbox Archive Migration API', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // 清理测试沙盒记录
    await MongoSandboxInstance.deleteMany({ sandboxId: /^test-sandbox-archive-/ });
    adminMocks.archiveSandboxResources.mockResolvedValue({
      total: 0,
      successCount: 0,
      failCount: 0,
      failures: []
    });
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

  it('migrates upstream/main nested edit-debug metadata and archives all matching records', async () => {
    const inactiveDate = subDays(new Date(), 10);
    const legacyDocId = new mongoose.Types.ObjectId();

    await MongoSandboxInstance.collection.insertOne({
      _id: legacyDocId,
      provider: 'opensandbox',
      sandboxId: 'test-sandbox-archive-legacy-metadata',
      type: 'edit-debug',
      status: 'stopped',
      lastActiveAt: inactiveDate,
      createdAt: inactiveDate,
      metadata: {
        metadata: new Map([
          ['skillName', 'Legacy Skill'],
          ['versionId', 'legacy-version']
        ])
      }
    });

    await MongoSandboxInstance.insertMany(
      Array.from({ length: 25 }).map((_, index) => ({
        provider: 'opensandbox',
        sandboxId: `test-sandbox-archive-many-${index}`,
        status: 'stopped',
        lastActiveAt: inactiveDate,
        createdAt: inactiveDate
      }))
    );

    adminMocks.archiveSandboxResources.mockResolvedValue({
      total: 26,
      successCount: 26,
      failCount: 0,
      failures: []
    });

    const result = await migrateSandboxArchiveData({ runArchive: true, inactiveDays: 5 });

    expect(result.legacyMetadataUpdatedCount).toBe(1);
    expect(result.archiveResult?.total).toBe(26);
    expect(result.archiveResult?.successCount).toBe(26);
    expect(adminMocks.archiveSandboxResources).toHaveBeenCalledWith({
      inactiveBefore: expect.any(Date),
      providers: ['opensandbox']
    });

    const legacyDoc = await MongoSandboxInstance.findOne({ _id: legacyDocId }).lean();
    expect(legacyDoc?.metadata).toMatchObject({
      skillName: 'Legacy Skill',
      versionId: 'legacy-version'
    });
    expect(legacyDoc?.metadata?.metadata).toBeUndefined();
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

    adminMocks.archiveSandboxResources.mockResolvedValue({
      total: 1,
      successCount: 0,
      failCount: 1,
      failures: [
        {
          sandboxId: doc.sandboxId,
          error: 'Mock connection timeout to Devbox'
        }
      ]
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

    expect(adminMocks.archiveSandboxResources).toHaveBeenCalledWith({
      inactiveBefore: expect.any(Date),
      providers: ['opensandbox']
    });
  });
});
