import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import * as appResourcePermission from '@fastgpt/service/support/permission/app/resource';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backfillAppResourceRecords,
  backfillAppVersionResourceRecords,
  buildAppResourceSnapshot,
  validateAppResourceRecords,
  validateAppVersionResourceRecords,
  type AppResourceMigrationRecord
} from '@/migration/tasks/4171/20260916_backfill_app_resource_snapshots/service';

const teamId = new Types.ObjectId('65f000000000000000000081');
const tmbId = new Types.ObjectId('65f000000000000000000082');

describe('Benchmark 4171 Migration Performance & 100w Scale Testing', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(appResourcePermission, 'filterAuthorizedAppResources').mockImplementation(
      async ({ resources }) => resources
    );
    await Promise.all([MongoApp.deleteMany({}), MongoAppVersion.deleteMany({})]);
  });

  it('measures 100w (1,000,000) records workflow normalization and snapshot extraction throughput', () => {
    const TOTAL_RECORDS = 1_000_000;
    const CHUNK_SIZE = 100_000;
    const chunks = TOTAL_RECORDS / CHUNK_SIZE;

    const templateRecord: AppResourceMigrationRecord = {
      _id: new Types.ObjectId(),
      modules: [
        {
          nodeId: 'node-start',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'node-agent',
          flowNodeType: 'appModule',
          name: 'Agent',
          pluginId: 'plugin-123',
          inputs: [],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'node-start',
          target: 'node-agent'
        }
      ],
      chatConfig: {},
      resourceRefs: { skillIds: ['skill-ref-1', 'skill-ref-2'] }
    };

    const initialMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    let processedCount = 0;
    for (let c = 0; c < chunks; c++) {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const snapshot = buildAppResourceSnapshot(templateRecord, []);
        if (snapshot.resources.length > 0) {
          processedCount++;
        }
      }
    }

    const durationMs = performance.now() - startTime;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDiffMb = (finalMemory - initialMemory) / (1024 * 1024);
    const opsPerSec = (TOTAL_RECORDS / (durationMs / 1000)).toFixed(0);

    console.log(
      `[100w Benchmark] Normalized and extracted ${TOTAL_RECORDS.toLocaleString()} records in ${durationMs.toFixed(2)}ms (${opsPerSec} ops/sec, Heap diff: ${memoryDiffMb.toFixed(2)} MB)`
    );

    expect(processedCount).toBe(TOTAL_RECORDS);
    expect(durationMs).toBeLessThan(30_000); // 100w pure CPU normalization should complete well under 30s
  });

  it('measures 100w (1,000,000) streaming batch cursor validation pipeline simulation', () => {
    const TOTAL_RECORDS = 1_000_000;
    const BATCH_SIZE = 1_000;
    const totalBatches = TOTAL_RECORDS / BATCH_SIZE;

    const initialMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    let totalValidatedCount = 0;
    let failedCount = 0;

    for (let b = 0; b < totalBatches; b++) {
      const batchRecords: AppResourceMigrationRecord[] = Array.from(
        { length: BATCH_SIZE },
        (_, idx) => ({
          _id: new Types.ObjectId(),
          tmbId,
          resources: [
            { type: 'skill' as const, id: `skill-${idx}` },
            { type: 'agent' as const, id: `agent-${idx}` }
          ],
          publishedVersionId: new Types.ObjectId(),
          type: 'advanced'
        })
      );

      const failures = validateAppVersionResourceRecords(batchRecords);
      failedCount += failures.length;
      totalValidatedCount += batchRecords.length;
    }

    const durationMs = performance.now() - startTime;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDiffMb = (finalMemory - initialMemory) / (1024 * 1024);
    const opsPerSec = (TOTAL_RECORDS / (durationMs / 1000)).toFixed(0);

    console.log(
      `[100w Benchmark] Stream validated ${TOTAL_RECORDS.toLocaleString()} records (${totalBatches} batches) in ${durationMs.toFixed(2)}ms (${opsPerSec} ops/sec, Heap diff: ${memoryDiffMb.toFixed(2)} MB)`
    );

    expect(totalValidatedCount).toBe(TOTAL_RECORDS);
    expect(failedCount).toBe(0);
    expect(durationMs).toBeLessThan(15_000);
  });

  it('measures batch version backfill throughput on real MongoDB', async () => {
    const RECORD_COUNT = 300;
    const versions = Array.from({ length: RECORD_COUNT }, (_, index) => ({
      _id: new Types.ObjectId(),
      appId: new Types.ObjectId(),
      tmbId,
      time: new Date(),
      isPublish: true,
      nodes: [
        {
          nodeId: `node-${index}`,
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      resourceRefs: { skillIds: [`skill-${index}`] }
    }));

    await MongoAppVersion.collection.insertMany(versions);

    const start = performance.now();
    const result = await backfillAppVersionResourceRecords(versions);
    const duration = performance.now() - start;

    console.log(
      `[DB Benchmark] backfillAppVersionResourceRecords ${RECORD_COUNT} records took ${duration.toFixed(2)}ms (${(RECORD_COUNT / (duration / 1000)).toFixed(1)} ops/sec)`
    );

    expect(result.updatedCount).toBe(RECORD_COUNT);
    expect(result.failures).toHaveLength(0);
  });

  it('measures batch app backfill throughput on real MongoDB', async () => {
    const RECORD_COUNT = 300;
    const apps = Array.from({ length: RECORD_COUNT }, (_, index) => ({
      _id: new Types.ObjectId(),
      teamId,
      tmbId,
      name: `Legacy app ${index}`,
      type: 'advanced',
      modules: [
        {
          nodeId: `node-${index}`,
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {},
      resourceRefs: { skillIds: [`skill-${index}`] }
    }));

    await MongoApp.collection.insertMany(apps);

    const start = performance.now();
    const result = await backfillAppResourceRecords(apps);
    const duration = performance.now() - start;

    console.log(
      `[DB Benchmark] backfillAppResourceRecords ${RECORD_COUNT} records took ${duration.toFixed(2)}ms (${(RECORD_COUNT / (duration / 1000)).toFixed(1)} ops/sec)`
    );

    expect(result.updatedCount).toBe(RECORD_COUNT);
    expect(result.createdVersionCount).toBe(RECORD_COUNT);
    expect(result.failures).toHaveLength(0);
  });
});
