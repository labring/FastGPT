import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueOpsPerfRecord,
  flushOpsPerfBuffer,
  getOpsPerfBufferSnapshotForTest,
  opsPerfTimerProcess,
  resetOpsPerfBufferForTest
} from '@fastgpt/service/common/opsPerf/collector';
import {
  patchPerfContext,
  recordPerfPoint,
  recordPerfStageSpan,
  trackPerfStage,
  withPerfContext
} from '@fastgpt/service/common/opsPerf/context';
import { MongoOpsPerfBucket, MongoOpsPerfEvent } from '@fastgpt/service/common/opsPerf/schema';
import * as systemConstants from '@fastgpt/service/common/system/constants';

describe('opsPerf context and collector', () => {
  beforeEach(() => {
    resetOpsPerfBufferForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetOpsPerfBufferForTest();
  });

  it('isolates nested domains and merges concurrent stage spans by wall-clock interval', async () => {
    await withPerfContext(
      {
        domain: 'dataset.search',
        force: true,
        teamId: '507f1f77bcf86cd799439011',
        resourceIds: ['507f1f77bcf86cd799439012'],
        dims: {
          searchMode: 'mixedRecall',
          indexScale: 'm_100k',
          usingReRank: true,
          usingExtension: false,
          vectorEngine: 'pg'
        }
      },
      async () => {
        // 3 concurrent calls to vectorRecall (~25ms each) should merge to ~25ms wall-clock, not 75ms
        await Promise.all(
          [1, 2, 3].map(() =>
            trackPerfStage({ domain: 'dataset.search', stage: 'vectorRecall' }, async () => {
              await new Promise((resolve) => setTimeout(resolve, 25));
            })
          )
        );

        // Nested companion domain should not overwrite outer dataset.search context
        recordPerfPoint({
          domain: 'dataset.rerank',
          force: true,
          totalMs: 180,
          status: 'ok',
          dims: { model: 'bge-reranker-v2', hasSynonym: false },
          metrics: { totalCandidates: 60 }
        });

        patchPerfContext({
          domain: 'dataset.search',
          status: 'degraded',
          errorCode: 'RERANK_FALLBACK',
          metrics: { rerankFallbackCount: 1 },
          detail: { pgUsesHnsw: true, totalIndexCount: 45000 }
        });
      }
    );

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.buckets).toHaveLength(2);

    const searchBucket = snapshot.buckets.find((b) => b.domain === 'dataset.search');
    const rerankBucket = snapshot.buckets.find((b) => b.domain === 'dataset.rerank');
    expect(searchBucket).toBeDefined();
    expect(rerankBucket).toBeDefined();
    expect(searchBucket?.stages.vectorRecall?.count).toBe(1);
    expect(searchBucket?.stages.vectorRecall?.sumMs).toBeLessThan(200);
    expect(searchBucket?.metrics.rerankFallbackCount).toBe(1);

    // Degraded dataset.search must be retained as single-point event; companion rerank defaults to bucket-only
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.domain).toBe('dataset.search');
    expect(snapshot.events[0]?.reason).toBe('degraded');
    expect(snapshot.events[0]?.stages.vectorRecall?.callCount).toBe(3);
  });

  it('retains error/degraded events 100% and samples normal events according to randomValue', () => {
    const baseDims = {
      searchMode: 'embedding' as const,
      indexScale: 's_10k' as const,
      usingReRank: false,
      usingExtension: false,
      vectorEngine: 'pg' as const
    };

    // Normal request not sampled (random >= 0.02)
    enqueueOpsPerfRecord({
      domain: 'dataset.search',
      force: true,
      totalMs: 180,
      status: 'ok',
      dims: baseDims,
      randomValue: 0.5
    });
    // Normal request sampled (random < 0.02)
    enqueueOpsPerfRecord({
      domain: 'dataset.search',
      force: true,
      totalMs: 210,
      status: 'ok',
      dims: baseDims,
      randomValue: 0.01
    });
    // High-latency ok request is NOT treated as slow; only sampled by randomValue
    enqueueOpsPerfRecord({
      domain: 'dataset.search',
      force: true,
      totalMs: 2400,
      status: 'ok',
      dims: baseDims,
      randomValue: 0.99
    });
    // Degraded request is 100% retained even when random >= 0.02
    enqueueOpsPerfRecord({
      domain: 'dataset.search',
      force: true,
      totalMs: 1850,
      status: 'degraded',
      errorCode: 'RERANK_FALLBACK',
      dims: baseDims,
      randomValue: 0.99
    });

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.buckets).toHaveLength(1);
    expect(snapshot.buckets[0]?.total.count).toBe(4);
    expect(snapshot.events.map((e) => e.reason)).toEqual(['sample', 'degraded']);
  });

  it('flushes buckets and events to MongoLog and merges composite pipelines by wall-clock interval', async () => {
    const bucketTime = new Date();
    const dims = {
      searchMode: 'mixedRecall' as const,
      indexScale: 'l_500k' as const,
      usingReRank: true,
      usingExtension: true,
      vectorEngine: 'pg' as const
    };

    enqueueOpsPerfRecord({
      domain: 'dataset.search',
      force: true,
      createTime: bucketTime,
      totalMs: 420,
      status: 'ok',
      dims,
      stages: {
        // filter [0, 10], overlapping vectorLeaseWait [30, 60] & vectorRecall [32, 140], parallel fullText [30, 70]
        filter: { offsetMs: 0, ms: 10 },
        vectorRoute: { offsetMs: 10, ms: 20 },
        vectorLeaseWait: { offsetMs: 30, ms: 30 },
        vectorRecall: { offsetMs: 32, ms: 108 },
        vectorHydrate: { offsetMs: 140, ms: 15 },
        fullTextRecall: { offsetMs: 30, ms: 30 },
        fullTextHydrate: { offsetMs: 60, ms: 10 }
      },
      metrics: { pgHnswCount: 1 },
      randomValue: 0.005
    });
    const firstFlush = await flushOpsPerfBuffer();
    expect(firstFlush).toEqual({ bucketsFlushed: 1, eventsFlushed: 1 });

    enqueueOpsPerfRecord({
      domain: 'dataset.search',
      force: true,
      createTime: bucketTime,
      totalMs: 2300,
      status: 'degraded',
      errorCode: 'RERANK_FALLBACK',
      dims,
      stages: { vectorRecall: { offsetMs: 60, ms: 850 } },
      metrics: { pgExactCount: 1 },
      randomValue: 0.99
    });
    const secondFlush = await flushOpsPerfBuffer();
    expect(secondFlush).toEqual({ bucketsFlushed: 1, eventsFlushed: 1 });

    const buckets = await MongoOpsPerfBucket.find({ domain: 'dataset.search' }).lean();
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.total.count).toBe(2);
    expect(buckets[0]?.total.maxMs).toBe(2300);
    expect(buckets[0]?.stages?.vectorPipeline?.count).toBe(2);
    expect(buckets[0]?.stages?.vectorPipeline?.sumMs).toBe(995);
    expect(buckets[0]?.stages?.fullTextPipeline?.count).toBe(1);
    expect(buckets[0]?.stages?.fullTextPipeline?.sumMs).toBe(40);
    // Record 1 DB union [0, 155] = 155ms (not 10+145+40=195ms), Record 2 DB union [60, 910] = 850ms
    expect(buckets[0]?.stages?.dbPipeline?.count).toBe(2);
    expect(buckets[0]?.stages?.dbPipeline?.sumMs).toBe(1005);

    const events = await MongoOpsPerfEvent.find({ domain: 'dataset.search' }).lean();
    expect(events).toHaveLength(2);
  });

  it('strips raw upstream error text and maps failed stage to whitelist errorCode', async () => {
    const secretQuery = 'SECRET_USER_QUERY_12345';
    await expect(
      withPerfContext(
        {
          domain: 'dataset.search',
          force: true,
          dims: {
            searchMode: 'embedding',
            indexScale: 's_10k',
            usingReRank: false,
            usingExtension: false,
            vectorEngine: 'pg'
          }
        },
        async () => {
          await trackPerfStage({ domain: 'dataset.search', stage: 'embeddingApi' }, async () => {
            throw new Error(`upstream provider rejected prompt: ${secretQuery}`);
          });
        }
      )
    ).rejects.toThrow(secretQuery);

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.events).toHaveLength(1);
    const ev = snapshot.events[0]!;
    expect(ev.status).toBe('error');
    expect(ev.errorCode).toBe('EMBEDDING_ERROR');
    expect(JSON.stringify(ev)).not.toContain(secretQuery);
  });

  it('records silent fallback stage errors via trackPerfStage markError control', async () => {
    await withPerfContext(
      {
        domain: 'dataset.search',
        force: true,
        dims: {
          searchMode: 'embedding',
          indexScale: 's_10k',
          usingReRank: false,
          usingExtension: true,
          vectorEngine: 'pg'
        }
      },
      async () => {
        await trackPerfStage(
          { domain: 'dataset.search', stage: 'queryExtension' },
          async ({ markError }) => {
            markError();
            patchPerfContext({
              domain: 'dataset.search',
              status: 'degraded',
              errorCode: 'QUERY_EXTENSION_FALLBACK'
            });
          }
        );
      }
    );

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.reason).toBe('degraded');
    expect(snapshot.events[0]?.errorCode).toBe('QUERY_EXTENSION_FALLBACK');
    expect(snapshot.events[0]?.stages.queryExtension?.errorCount).toBe(1);
  });

  it('preserves raw stage spans so retry backoff gaps are excluded from stage, vectorPipeline, and dbPipeline durations', async () => {
    await withPerfContext(
      {
        domain: 'dataset.search',
        force: true,
        dims: {
          searchMode: 'embedding',
          indexScale: 'm_100k',
          usingReRank: false,
          usingExtension: false,
          vectorEngine: 'pg'
        }
      },
      async () => {
        const base = performance.now();
        // Two 10ms vectorRecall calls separated by a 500ms retry sleep gap
        recordPerfStageSpan({
          domain: 'dataset.search',
          stage: 'vectorRecall',
          startedAtPerf: base,
          endedAtPerf: base + 10,
          failed: true
        });
        recordPerfStageSpan({
          domain: 'dataset.search',
          stage: 'vectorRecall',
          startedAtPerf: base + 510,
          endedAtPerf: base + 520,
          failed: false
        });
      }
    );

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.buckets).toHaveLength(1);
    const bucket = snapshot.buckets[0]!;
    expect(bucket.stages.vectorRecall?.sumMs).toBeCloseTo(20, 0);
    expect(bucket.stages.vectorPipeline?.sumMs).toBeCloseTo(20, 0);
    expect(bucket.stages.dbPipeline?.sumMs).toBeCloseTo(20, 0);
  });

  it('escalates errorCode when an earlier degraded stage is followed by a terminal error', async () => {
    await expect(
      withPerfContext(
        {
          domain: 'dataset.search',
          force: true,
          dims: {
            searchMode: 'embedding',
            indexScale: 's_10k',
            usingReRank: false,
            usingExtension: true,
            vectorEngine: 'pg'
          }
        },
        async () => {
          await trackPerfStage(
            { domain: 'dataset.search', stage: 'queryExtension' },
            async ({ markError }) => {
              markError();
              patchPerfContext({
                domain: 'dataset.search',
                status: 'degraded',
                errorCode: 'QUERY_EXTENSION_FALLBACK'
              });
            }
          );
          await trackPerfStage({ domain: 'dataset.search', stage: 'embeddingApi' }, async () => {
            throw new Error('embedding down');
          });
        }
      )
    ).rejects.toThrow('embedding down');

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.events).toHaveLength(1);
    const ev = snapshot.events[0]!;
    expect(ev.status).toBe('error');
    expect(ev.errorCode).toBe('EMBEDDING_ERROR');
    expect(ev.stages.queryExtension?.errorCount).toBe(1);
    expect(ev.stages.embeddingApi?.errorCount).toBe(1);
  });

  it('does not misattribute an uncaught non-stage error to an earlier silent fallback or recovered retry', async () => {
    await expect(
      withPerfContext(
        {
          domain: 'dataset.search',
          force: true,
          dims: {
            searchMode: 'embedding',
            indexScale: 's_10k',
            usingReRank: false,
            usingExtension: true,
            vectorEngine: 'pg'
          }
        },
        async () => {
          // 1. Silent fallback in queryExtension
          await trackPerfStage(
            { domain: 'dataset.search', stage: 'queryExtension' },
            async ({ markError }) => {
              markError();
              patchPerfContext({
                domain: 'dataset.search',
                status: 'degraded',
                errorCode: 'QUERY_EXTENSION_FALLBACK'
              });
            }
          );
          // 2. Retried failure in vectorRecall that was caught & recovered
          try {
            await trackPerfStage({ domain: 'dataset.search', stage: 'vectorRecall' }, async () => {
              throw new Error('transient vector hiccup');
            });
          } catch {
            // recovered by retry
          }
          // 3. Unrelated uncaught error outside any tracked stage
          throw new Error('unexpected orchestrator bug');
        }
      )
    ).rejects.toThrow('unexpected orchestrator bug');

    const snapshot = getOpsPerfBufferSnapshotForTest();
    expect(snapshot.events).toHaveLength(1);
    const ev = snapshot.events[0]!;
    expect(ev.status).toBe('error');
    expect(ev.errorCode).toBe('SEARCH_ERROR');
  });

  it('skips lazy options factory and timer registration in community edition', async () => {
    vi.spyOn(systemConstants, 'isProVersion').mockReturnValue(false);
    const optionsFactory = vi.fn(() => ({
      domain: 'dataset.search' as const,
      dims: {
        searchMode: 'embedding' as const,
        indexScale: 's_10k' as const,
        usingReRank: false,
        usingExtension: false,
        vectorEngine: 'pg' as const
      }
    }));

    const out = await withPerfContext(optionsFactory, async () => 'ok');
    expect(out).toBe('ok');
    expect(optionsFactory).not.toHaveBeenCalled();

    await opsPerfTimerProcess();
    expect(getOpsPerfBufferSnapshotForTest().timerStarted).toBe(false);
  });
});
