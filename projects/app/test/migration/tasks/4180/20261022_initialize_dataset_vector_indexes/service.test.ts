import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemMigrationContext } from '@/migration/registry';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  options: vi.fn()
}));
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg') & { default: typeof import('pg') }>();
  const driver = actual.default ?? actual;
  class MockClient {
    constructor(options: unknown) {
      mocks.options(options);
    }
    connect = mocks.connect;
    query = mocks.query;
    end = mocks.end;
    on = mocks.on;
  }
  return { ...actual, default: { ...driver, Client: MockClient } };
});
import { removeLegacyPgVectorIndex } from '@/migration/tasks/4180/20261022_initialize_dataset_vector_indexes/service';

const ownedIndex = {
  on_table: true,
  method: 'hnsw',
  opclass: 'vector_ip_ops',
  column_name: 'vector',
  columns: 1,
  no_expression: true,
  no_predicate: true
};
let table: { schema: string; vector_type: string } | undefined;
let index: typeof ownedIndex | undefined;
let removed: boolean;
const createContext = (controller = new AbortController()) =>
  ({
    signal: controller.signal,
    assertActive: vi.fn(async () => {}),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }) satisfies Pick<SystemMigrationContext, 'assertActive' | 'signal' | 'logger'>;

beforeEach(() => {
  table = { schema: 'vectors"schema', vector_type: 'vector' };
  index = { ...ownedIndex };
  removed = true;
  mocks.options.mockClear();
  mocks.on.mockClear();
  mocks.connect.mockReset().mockResolvedValue(undefined);
  mocks.end.mockReset().mockResolvedValue(undefined);
  mocks.query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes('AS vector_type')) return { rows: table ? [table] : [] };
    if (sql.includes('AS on_table')) return { rows: index ? [index] : [] };
    if (sql.startsWith('SET lock_timeout')) return { rows: [] };
    if (sql.startsWith('DROP INDEX')) return { rows: [] };
    if (sql.includes('AS removed')) return { rows: [{ removed }] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});
afterEach(() => vi.useRealTimers());

describe('removeLegacyPgVectorIndex', () => {
  it.each(['vector', 'halfvec'])('removes the owned global %s index online', async (storage) => {
    table!.vector_type = storage;
    index!.opclass = `${storage}_ip_ops`;
    await removeLegacyPgVectorIndex(createContext());
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('advisory_lock'))).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith(
      'DROP INDEX CONCURRENTLY IF EXISTS "vectors""schema"."vector_index"'
    );
    expect(mocks.options).toHaveBeenCalledWith(
      expect.objectContaining({ query_timeout: 0, statement_timeout: 0 })
    );
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it.each(['table', 'index'])('does nothing when the %s is already absent', async (missing) => {
    if (missing === 'table') table = undefined;
    else index = undefined;
    await removeLegacyPgVectorIndex(createContext());
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('DROP INDEX'))).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it.each([
    { on_table: false },
    { method: 'btree' },
    { opclass: 'vector_cosine_ops' },
    { column_name: 'other_vector' },
    { columns: 2 },
    { no_expression: false },
    { no_predicate: false }
  ])('refuses a same-name index with a different definition: %j', async (change) => {
    index = { ...ownedIndex, ...change };
    await expect(removeLegacyPgVectorIndex(createContext())).rejects.toThrow('mismatched');
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('DROP INDEX'))).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('does not infer ownership for an unsupported vector column type', async () => {
    table!.vector_type = 'sparsevec';
    await expect(removeLegacyPgVectorIndex(createContext())).rejects.toThrow('mismatched');
  });

  it.each(['connect', 'drop', 'verify'])(
    'propagates %s failures and closes the session',
    async (phase) => {
      if (phase === 'connect') mocks.connect.mockRejectedValueOnce(new Error('connection lost'));
      if (phase === 'verify') removed = false;
      if (phase === 'drop') {
        const query = mocks.query.getMockImplementation()!;
        mocks.query.mockImplementation(async (sql: string, ...args) => {
          if (sql.startsWith('DROP INDEX')) throw new Error('permission denied');
          return query(sql, ...args);
        });
      }
      await expect(removeLegacyPgVectorIndex(createContext())).rejects.toThrow();
      expect(mocks.end).toHaveBeenCalledOnce();
    }
  );

  it('rechecks the lease immediately before DROP', async () => {
    const context = createContext();
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args) => {
      if (sql.includes('AS on_table')) {
        context.assertActive.mockRejectedValue(new Error('lease lost'));
      }
      return query(sql, ...args);
    });
    await expect(removeLegacyPgVectorIndex(context)).rejects.toThrow('lease lost');
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('DROP INDEX'))).toBe(false);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it.each(['55P03', '40P01'])('yields on PG lock conflict %s then retries DROP', async (code) => {
    vi.useFakeTimers();
    const context = createContext();
    const query = mocks.query.getMockImplementation()!;
    let attempts = 0;
    mocks.query.mockImplementation(async (sql: string, ...args) => {
      if (sql.startsWith('DROP INDEX') && ++attempts === 1) {
        throw Object.assign(new Error('PG lock conflict'), { code });
      }
      return query(sql, ...args);
    });
    const run = removeLegacyPgVectorIndex(context);
    await vi.advanceTimersByTimeAsync(500);
    expect(attempts).toBe(1);
    expect(mocks.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await run;
    expect(attempts).toBe(2);
    expect(context.assertActive).toHaveBeenCalledTimes(3);
    expect(context.logger.warn).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('stops retrying lock conflicts when the migration is aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args) => {
      if (sql.startsWith('DROP INDEX')) {
        throw Object.assign(new Error('PG lock conflict'), { code: '55P03' });
      }
      return query(sql, ...args);
    });
    const run = removeLegacyPgVectorIndex(createContext(controller));
    const rejected = expect(run).rejects.toThrow('migration stopped');
    await vi.advanceTimersByTimeAsync(500);
    controller.abort(new Error('migration stopped'));
    await vi.advanceTimersByTimeAsync(500);
    await rejected;
    expect(mocks.query.mock.calls.filter(([sql]) => sql.startsWith('DROP INDEX'))).toHaveLength(1);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it('starts no connection for an already aborted migration', async () => {
    const controller = new AbortController();
    controller.abort(new Error('migration stopped'));
    await expect(removeLegacyPgVectorIndex(createContext(controller))).rejects.toThrow('stopped');
    expect(mocks.options).not.toHaveBeenCalled();
  });

  it('closes a pending DROP once when the migration is aborted', async () => {
    const controller = new AbortController();
    let rejectDrop: ((error: Error) => void) | undefined;
    const query = mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async (sql: string, ...args) => {
      if (sql.startsWith('DROP INDEX')) {
        return new Promise((_, reject) => {
          rejectDrop = reject;
        });
      }
      return query(sql, ...args);
    });
    mocks.end.mockImplementation(async () => {
      rejectDrop?.(new Error('connection terminated'));
    });
    const run = removeLegacyPgVectorIndex(createContext(controller));
    const rejected = expect(run).rejects.toThrow('connection terminated');
    await vi.waitFor(() => expect(rejectDrop).toBeDefined());
    controller.abort();
    await rejected;
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('AS removed'))).toBe(false);
  });
});
