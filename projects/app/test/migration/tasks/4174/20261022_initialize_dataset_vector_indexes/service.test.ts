import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { removeLegacyPgVectorIndex } from '@/migration/tasks/4174/20261022_initialize_dataset_vector_indexes/service';
import { PG_INDEX_MAINTENANCE_LOCK } from '@fastgpt/service/common/vectorDB/pg/datasetIndex';

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
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.includes('AS vector_type')) return { rows: table ? [table] : [] };
    if (sql.includes('AS on_table')) return { rows: index ? [index] : [] };
    if (sql.startsWith('DROP INDEX')) return { rows: [] };
    if (sql.includes('AS removed')) return { rows: [{ removed }] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('removeLegacyPgVectorIndex', () => {
  it.each(['vector', 'halfvec'])('removes the owned global %s index online', async (storage) => {
    table!.vector_type = storage;
    index!.opclass = `${storage}_ip_ops`;
    await removeLegacyPgVectorIndex(createContext());
    expect(mocks.query.mock.calls[0]).toEqual([
      'SELECT pg_try_advisory_lock($1) AS locked',
      [PG_INDEX_MAINTENANCE_LOCK]
    ]);
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

  it('starts no connection for an already aborted migration', async () => {
    const controller = new AbortController();
    controller.abort(new Error('migration stopped'));
    await expect(removeLegacyPgVectorIndex(createContext(controller))).rejects.toThrow('stopped');
    expect(mocks.options).not.toHaveBeenCalled();
  });

  it('closes a lock-waiting connection once when the migration is aborted', async () => {
    const controller = new AbortController();
    let rejectLock: ((error: Error) => void) | undefined;
    mocks.query.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectLock = reject;
        })
    );
    mocks.end.mockImplementation(async () => {
      rejectLock?.(new Error('connection terminated'));
    });
    const run = removeLegacyPgVectorIndex(createContext(controller));
    const rejected = expect(run).rejects.toThrow('connection terminated');
    await vi.waitFor(() => expect(rejectLock).toBeDefined());
    controller.abort();
    await rejected;
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
