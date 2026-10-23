import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  query: vi.fn(),
  monitor: vi.fn(),
  on: vi.fn(),
  warn: vi.fn(),
  options: vi.fn(),
  memory: vi.fn(),
  error: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/pg/indexMemory', () => ({
  configurePgIndexMemory: mocks.memory
}));
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg') & { default: typeof import('pg') }>();
  const driver = actual.default ?? actual;
  class MockClient {
    constructor(options: unknown) {
      mocks.options(options);
    }
    connect = mocks.connect;
    end = mocks.end;
    query = mocks.query;
    on = mocks.on;
  }
  return {
    ...actual,
    default: { ...driver, Client: MockClient }
  };
});
vi.mock('@fastgpt/service/common/vectorDB/pg/controller', () => ({
  PgClient: { query: mocks.monitor }
}));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLogger: () => ({ info: vi.fn(), warn: mocks.warn, error: mocks.error })
}));
import {
  ensurePgDatasetIndex,
  getPgDatasetIndexName
} from '@fastgpt/service/common/vectorDB/pg/datasetIndex';

const scope = { teamId: '507f1f77bcf86cd799439011', datasetId: '507f1f77bcf86cd799439012' };
const validIndex = {
  valid: true,
  ready: true,
  on_table: true,
  method: 'hnsw',
  opclass: 'halfvec_ip_ops',
  columns: 1,
  expression: '(vector)::halfvec(16)',
  predicate: `((dataset_id)::text = '${scope.datasetId}'::text) AND ((team_id)::text = '${scope.teamId}'::text)`
};
type Index = typeof validIndex;
let index: Index | undefined;
let rows: number;
let locked: boolean;
let table: { schema: string; vector_type: string; dimensions: number } | undefined;
let ddl: (() => Promise<void>) | undefined;
const callbacks = { onBuilding: vi.fn(async () => {}), onProgress: vi.fn() };

beforeEach(() => {
  index = undefined;
  rows = 30001;
  locked = true;
  ddl = undefined;
  table = { schema: 'public', vector_type: 'vector', dimensions: 16 };
  Object.values(mocks).forEach((mock) => mock.mockReset());
  callbacks.onBuilding.mockReset().mockResolvedValue(undefined);
  callbacks.onProgress.mockReset();
  mocks.connect.mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
  mocks.monitor.mockResolvedValue({ rows: [] });
  mocks.memory.mockResolvedValue({
    source: 'estimate',
    estimatedMB: 256,
    budgetMB: 256,
    configuredMB: 64
  });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked }] };
    if (sql.includes('JOIN pg_attribute')) return { rows: table ? [table] : [] };
    if (sql.includes('JOIN pg_index')) return { rows: index ? [index] : [] };
    if (sql.includes('SELECT count(*)')) return { rows: [{ count: String(rows) }] };
    if (sql.includes('DROP INDEX')) {
      index = undefined;
      return { rows: [] };
    }
    if (sql.includes('pg_backend_pid'))
      return { rows: [{ pid: 42, maintenance_work_mem: '1GB', parallel_workers: '2' }] };
    if (sql.includes('CREATE INDEX')) {
      await ddl?.();
      index = { ...validIndex };
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});
afterEach(() => vi.useRealTimers());

describe('getPgDatasetIndexName', () => {
  it('derives stable bounded names and rejects unsafe IDs', () => {
    expect(getPgDatasetIndexName(scope.datasetId)).toBe(`modeldata_fp16_${scope.datasetId}`);
    expect(getPgDatasetIndexName(scope.datasetId.toUpperCase())).toBe(
      `modeldata_fp16_${scope.datasetId.toUpperCase()}`
    );
    expect(() => getPgDatasetIndexName("bad'--")).toThrow(ZodError);
  });
});

describe('ensurePgDatasetIndex', () => {
  it('builds only a matching team/dataset FP16 expression and closes the dedicated unlimited-timeout session', async () => {
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: true
    });
    expect(mocks.options).toHaveBeenCalledWith(
      expect.objectContaining({ query_timeout: 0, statement_timeout: 0 })
    );
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('CREATE INDEX'))?.[0]).toContain(
      'USING hnsw ((vector::halfvec(16)) halfvec_ip_ops)'
    );
    expect(callbacks.onBuilding).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
    const connectionError = mocks.on.mock.calls.find(([event]) => event === 'error')![1];
    connectionError(new Error('socket reset'));
    const notice = mocks.on.mock.calls.find(([event]) => event === 'notice')![1];
    notice({ message: 'graph no longer fits', detail: 'slow', hint: 'more memory' });
    expect(mocks.warn).toHaveBeenCalledWith(
      'PG dataset index build notice',
      expect.objectContaining({ hint: 'more memory' })
    );
  });

  it('returns an existing valid index without re-counting or starting a build', async () => {
    index = { ...validIndex };
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: false
    });
    expect(callbacks.onBuilding).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('count(*)'))).toBe(false);
    expect(mocks.memory).not.toHaveBeenCalled();
  });

  it.each([
    {
      source: 'estimate',
      estimatedMB: 256,
      configuredMB: 64,
      budgetMB: 256,
      warning: true,
      diskBasedBuildMayBeNeeded: false
    },
    {
      source: 'postgres',
      estimatedMB: 8192,
      configuredMB: 8192,
      budgetMB: 8192,
      warning: false,
      diskBasedBuildMayBeNeeded: false
    },
    {
      source: 'estimate',
      estimatedMB: 256,
      configuredMB: 512,
      budgetMB: 256,
      warning: false,
      diskBasedBuildMayBeNeeded: false
    },
    {
      source: 'capped',
      estimatedMB: 8192,
      configuredMB: 4096,
      budgetMB: 2048,
      warning: true,
      diskBasedBuildMayBeNeeded: true
    }
  ])(
    'warns when the estimate exceeds the original PG budget: $source/$configuredMB',
    async ({ warning, diskBasedBuildMayBeNeeded, ...memory }) => {
      mocks.memory.mockResolvedValue(memory);
      expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toMatchObject({
        created: true
      });
      if (warning) {
        expect(mocks.warn).toHaveBeenCalledOnce();
        expect(mocks.warn).toHaveBeenCalledWith(
          'PG index memory estimate exceeds maintenance_work_mem; review memory configuration',
          {
            ...scope,
            indexName: getPgDatasetIndexName(scope.datasetId),
            ...memory,
            diskBasedBuildMayBeNeeded
          }
        );
      } else {
        expect(mocks.warn).not.toHaveBeenCalled();
      }
    }
  );

  it('does not start DDL when reading or setting the session budget fails', async () => {
    mocks.memory.mockRejectedValue(new Error('PG connection lost'));
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow(
      'PG connection lost'
    );
    expect(callbacks.onBuilding).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => /DROP INDEX|CREATE INDEX/.test(sql))).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('builds the same FP16 partial index for halfvec storage and reuses its simplified column key', async () => {
    table!.vector_type = 'halfvec';
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string) => {
      const result = await query(sql);
      if (sql.includes('CREATE INDEX')) index!.expression = 'vector';
      return result;
    });

    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: true
    });
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: false
    });
    expect(callbacks.onBuilding).toHaveBeenCalledOnce();
  });

  it('repairs only a definition-matching invalid concurrent index', async () => {
    index = { ...validIndex, valid: false, ready: false };
    await ensurePgDatasetIndex({ ...scope, ...callbacks });
    const statements = mocks.query.mock.calls.map(([sql]) => sql as string);
    expect(statements.findIndex((sql) => sql.includes('DROP INDEX CONCURRENTLY'))).toBeLessThan(
      statements.findIndex((sql) => sql.includes('CREATE INDEX CONCURRENTLY'))
    );
  });

  it.each([
    { on_table: false },
    { method: 'btree' },
    { opclass: 'vector_ip_ops' },
    { columns: 2 },
    { expression: 'vector::halfvec(8)' },
    { expression: 'vector' },
    { predicate: null }
  ])('never removes a mismatched same-name index: %j', async (overrides) => {
    index = { ...validIndex, ...overrides } as Index;
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow('Refusing');
    expect(mocks.query.mock.calls.some(([sql]) => /DROP INDEX|CREATE INDEX/.test(sql))).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('skips building if the delayed dataset has shrunk to the threshold', async () => {
    rows = 30000;
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'none',
      created: false
    });
    expect(callbacks.onBuilding).not.toHaveBeenCalled();
  });

  it('removes a matching failed index when the dataset shrinks below the build threshold', async () => {
    rows = 30000;
    index = { ...validIndex, valid: false };
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'none',
      created: false
    });
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('DROP INDEX CONCURRENTLY'))).toBe(
      true
    );
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('CREATE INDEX'))).toBe(false);
  });

  it('rechecks the catalog after acquiring the lock if a previous worker has just finished', async () => {
    const query = mocks.query.getMockImplementation()!;
    let reads = 0;
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN pg_index')) return { rows: ++reads === 1 ? [] : [validIndex] };
      return query(sql);
    });
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: false
    });
    expect(callbacks.onBuilding).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { schema: 'public', vector_type: 'bit', dimensions: 16 },
    { schema: 'public', vector_type: 'vector', dimensions: -1 },
    { schema: 'public', vector_type: 'vector', dimensions: 4001 }
  ])('rejects unsupported storage without creating an index', async (value) => {
    table = value;
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow(
      'vector or halfvec column'
    );
    expect(callbacks.onBuilding).not.toHaveBeenCalled();
  });

  it('respects another database build lock', async () => {
    locked = false;
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow('still running');
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('closes sessions on connection, DDL and post-build validation failures', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('connect failed'));
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow(
      'connect failed'
    );
    ddl = async () => {
      throw new Error('out of memory');
    };
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow('out of memory');
    ddl = async () => {
      table!.dimensions = 8;
    };
    await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow('Refusing');
    expect(mocks.end).toHaveBeenCalledTimes(3);
  });

  it.each([undefined, { ...validIndex, valid: false }, { ...validIndex, ready: false }])(
    'does not declare success if the final index catalog state is invalid',
    async (built) => {
      const query = mocks.query.getMockImplementation()!;
      let reads = 0;
      mocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('JOIN pg_index')) return { rows: ++reads <= 2 || !built ? [] : [built] };
        return query(sql);
      });
      await expect(ensurePgDatasetIndex({ ...scope, ...callbacks })).rejects.toThrow(
        'not valid after build'
      );
    }
  );

  it('reports actual PG progress without overlapping polls, tolerates monitor errors and clears timers', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    ddl = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    mocks.monitor.mockRejectedValueOnce(new Error('stats unavailable')).mockResolvedValue({
      rows: [
        {
          phase: 'loading tuples',
          blocks_done: '10',
          blocks_total: '20',
          tuples_done: '2',
          tuples_total: '0'
        }
      ]
    });
    const building = ensurePgDatasetIndex({ ...scope, ...callbacks });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.warn).toHaveBeenCalledWith(
      'PG dataset index progress query failed',
      expect.anything()
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(callbacks.onProgress).toHaveBeenCalledWith({
      phase: 'loading tuples',
      blocksDone: 10,
      blocksTotal: 20,
      tuplesDone: 2,
      tuplesTotal: 0
    });
    let resolveProgress!: (value: unknown) => void;
    mocks.monitor.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProgress = resolve;
        })
    );
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.monitor).toHaveBeenCalledTimes(3);
    resolveProgress({ rows: [] });
    finish();
    await building;
    expect(vi.getTimerCount()).toBe(0);
  });
});
