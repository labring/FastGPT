import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OgClient } from '@fastgpt/service/common/vectorDB/opengauss/controller';
import {
  assertOpenGaussFullTextVersion,
  assertOpenGaussFullTextCapability,
  prepareOpenGaussFullText,
  getOpenGaussFullTextMetadata,
  fillOpenGaussFullText,
  preflightOpenGaussFullText,
  searchOpenGaussFullText,
  OPENGAUSS_FULL_TEXT_ANALYZER_VERSION
} from '@fastgpt/service/common/vectorDB/opengauss/fullText';

const client = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@fastgpt/service/common/vectorDB/opengauss/controller', () => ({
  OgClient: { query: vi.fn() },
  connectOg: async () => ({ connect: async () => client })
}));
const metadata = {
  targetId: randomUUID(),
  schemaVersion: 1,
  analyzerVersion: 'opengauss-bm25-fastgpt-jieba-search-v1'
};
const result = (rows: Record<string, unknown>[]) => ({
  rows,
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: []
});

beforeEach(() => {
  client.release.mockReset();
  client.query.mockReset().mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT version()'))
      return result([{ version: '(openGauss 7.0.0 build test)' }]);
    if (sql.includes("pg_am WHERE amname='bm25'")) return result([{ exists: 1 }]);
    if (sql.includes('SELECT relkind')) return result([{ relkind: 'r', reloptions: null }]);
    return result([]);
  });
  vi.mocked(OgClient.query)
    .mockReset()
    .mockImplementation(async (sql) => {
      const text = typeof sql === 'string' ? sql : sql.text;
      if (text.includes('target_id AS')) return result([metadata]);
      if (text.startsWith('EXPLAIN'))
        return result([{ 'QUERY PLAN': 'Index Scan using modeldata_fulltext on modeldata' }]);
      return result([{ valid: true }]);
    });
});

describe('OpenGauss native BM25', () => {
  it('uses the analyzer version declared by the shared metadata schema', () => {
    expect(OPENGAUSS_FULL_TEXT_ANALYZER_VERSION).toBe(metadata.analyzerVersion);
  });

  it('preflights existing rows without writing or rejecting pending NULL tokens', async () => {
    const row = { vectorId: '1', teamId: 't', datasetId: 'd', collectionId: 'c', text: '全文' };
    vi.mocked(OgClient.query).mockResolvedValueOnce(result([{ id: '1' }]));
    expect(await preflightOpenGaussFullText([row])).toEqual(['1']);
    expect(OgClient.query).toHaveBeenCalledOnce();
    const [sql, values] = vi.mocked(OgClient.query).mock.calls[0];
    expect(sql).toContain(
      'm.id IS NULL OR (m.fulltext_tokens IS NOT NULL AND m.fulltext_tokens IS DISTINCT FROM v.tokens)'
    );
    expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/);
    expect(values).toEqual(['1', 't', 'd', 'c', '全文']);
  });

  it.each([
    '(openGauss 7.0.0-RC2 build test)',
    '(openGauss 7.0.0 build test)',
    'openGauss 7.0.1 LTS'
  ])('accepts a supported product release %s', (version) =>
    expect(() => assertOpenGaussFullTextVersion(version)).not.toThrow()
  );
  it.each(['PostgreSQL 15.19', 'openGauss 7.0.0-RC1', 'openGauss 6.0.0', 'openGauss 8.0.0'])(
    'rejects an unsupported release %s',
    (version) => expect(() => assertOpenGaussFullTextVersion(version)).toThrow()
  );
  it('prepares a nullable token field and BM25 index without rebuilding vectors or overwriting target identity', async () => {
    expect(await prepareOpenGaussFullText()).toEqual(metadata);
    const statements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain('ALTER TABLE modeldata ADD COLUMN fulltext_tokens TEXT');
    expect(statements).toContain(
      'CREATE INDEX modeldata_fulltext ON modeldata USING bm25(fulltext_tokens)'
    );
    expect(statements.some((sql) => sql.includes('SELECT true,$1::uuid,1,$2::text'))).toBe(true);
    expect(statements.some((sql) => /DROP|DELETE|TRUNCATE|SET vector/i.test(sql))).toBe(false);
    expect(statements).toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('rolls back before building the BM25 index when existing metadata is incompatible', async () => {
    const query = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return result([{ '?column?': 1 }]);
      if (sql.includes('target_id AS "targetId"'))
        return result([{ ...metadata, schemaVersion: 99 }]);
      return query(sql);
    });
    await expect(prepareOpenGaussFullText()).rejects.toThrow();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith('CREATE INDEX'))).toBe(
      false
    );
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('refuses unsupported storage or an incompatible token column, and rolls back DDL', async () => {
    const query = client.query.getMockImplementation()!;
    for (const options of [['storage_type=ustore'], ['orientation=column']]) {
      client.query.mockImplementation(async (sql: string) =>
        sql.includes('SELECT relkind')
          ? result([{ relkind: 'r', reloptions: options }])
          : query(sql)
      );
      await expect(prepareOpenGaussFullText()).rejects.toThrow('astore');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    }
    client.query.mockImplementation(async (sql: string) =>
      sql.includes('information_schema.columns')
        ? result([{ data_type: 'varchar', is_nullable: 'NO' }])
        : query(sql)
    );
    await expect(prepareOpenGaussFullText()).rejects.toThrow('nullable TEXT');
  });
  it('requires the actual BM25 method and a valid index execution plan', async () => {
    vi.mocked(OgClient.query).mockResolvedValueOnce(result([{ valid: false }]));
    await expect(assertOpenGaussFullTextCapability()).rejects.toThrow('index');
    vi.mocked(OgClient.query)
      .mockResolvedValueOnce(result([{ valid: true }]))
      .mockResolvedValueOnce(result([{ 'QUERY PLAN': 'Seq Scan on modeldata' }]));
    await expect(assertOpenGaussFullTextCapability()).rejects.toThrow('expected full-text index');
    const query = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql: string) =>
      sql.includes("pg_am WHERE amname='bm25'") ? result([]) : query(sql)
    );
    await expect(prepareOpenGaussFullText()).rejects.toThrow('unavailable');
  });
  it('rejects metadata from another analyzer version or schema generation', async () => {
    vi.mocked(OgClient.query).mockResolvedValueOnce(
      result([
        { ...metadata, analyzerVersion: 'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1' }
      ])
    );
    await expect(getOpenGaussFullTextMetadata()).rejects.toThrow('analyzer');
    vi.mocked(OgClient.query).mockResolvedValueOnce(
      result([{ ...metadata, analyzerVersion: 'opengauss-bm25-jieba-v1' }])
    );
    await expect(getOpenGaussFullTextMetadata()).rejects.toThrow();
    vi.mocked(OgClient.query).mockResolvedValueOnce(result([{ ...metadata, schemaVersion: 2 }]));
    await expect(getOpenGaussFullTextMetadata()).rejects.toThrow();
  });
  it('binds analyzed terms and all filters before indexed top-K and omits zero-score non-matches', async () => {
    const props = {
      teamId: 't',
      datasetIds: ['d'],
      query: "'中文查询",
      limit: 10,
      forbidCollectionIdList: ['hidden'],
      filterCollectionIdList: ['allowed', 'hidden']
    };
    vi.mocked(OgClient.query).mockResolvedValueOnce(
      result([
        { vectorId: '1', collectionId: 'allowed', score: '1.7' },
        { vectorId: '2', collectionId: 'allowed', score: 0 }
      ])
    );
    expect(await searchOpenGaussFullText(props)).toEqual([
      { vectorId: '1', collectionId: 'allowed', score: 1.7 }
    ]);
    const [sql, values] = vi.mocked(OgClient.query).mock.calls[0];
    expect(sql).toContain('ORDER BY fulltext_tokens <&> $1::text DESC LIMIT $6');
    expect(sql).toContain('indexscan (modeldata modeldata_fulltext)');
    expect(sql).not.toContain(props.query);
    expect(values).toEqual(["' 中文 查询", 't', ['d'], ['allowed'], ['hidden'], 10]);
    vi.mocked(OgClient.query).mockClear();
    for (const extra of [
      { query: '' },
      { query: '是什么意思？' },
      { limit: 0 },
      { datasetIds: [] },
      { filterCollectionIdList: [] }
    ])
      expect(await searchOpenGaussFullText({ ...props, ...extra })).toEqual([]);
    expect(OgClient.query).not.toHaveBeenCalled();
  });
  it('conditionally fills existing matching rows and supports validation without writes', async () => {
    const row = { vectorId: '1', teamId: 't', datasetId: 'd', collectionId: 'c', text: '全文' };
    vi.mocked(OgClient.query)
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(result([{ id: '1' }]));
    expect(await fillOpenGaussFullText([row])).toEqual(['1']);
    expect(vi.mocked(OgClient.query).mock.calls[0][0]).toContain('m.fulltext_tokens IS NULL');
    vi.mocked(OgClient.query).mockClear().mockResolvedValue(result([]));
    expect(await fillOpenGaussFullText([row], true)).toEqual([]);
    expect(OgClient.query).toHaveBeenCalledOnce();
    expect(vi.mocked(OgClient.query).mock.calls[0][0]).not.toContain('UPDATE');
  });
});
